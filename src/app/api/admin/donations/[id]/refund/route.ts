import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { requireAdmin } from "@/lib/auth/admin";
import { logger } from "@/lib/logger";

interface DonationMeta {
  total_refunded_cents?: number;
  refunds?: unknown[];
  [k: string]: unknown;
}

function refundState(amountCents: number, feeCents: number, meta: DonationMeta) {
  const gross = (amountCents ?? 0) + (feeCents ?? 0);
  const alreadyRefunded = Number(meta.total_refunded_cents ?? 0);
  const remaining = Math.max(0, gross - alreadyRefunded);
  return { gross, alreadyRefunded, remaining };
}

/**
 * GET — refund info (gross, already refunded, remaining, suggested net after
 * Stripe fee when the deduct-fees setting is enabled — mirrors registration).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: d } = await admin
    .from("eckcm_donations")
    .select("id, amount_cents, fee_cents, payment_method, status, metadata")
    .eq("id", id)
    .single();
  if (!d) return NextResponse.json({ error: "Donation not found" }, { status: 404 });

  const meta = (d.metadata as DonationMeta | null) ?? {};
  const { gross, alreadyRefunded, remaining } = refundState(d.amount_cents, d.fee_cents, meta);

  const { data: cfg } = await admin
    .from("eckcm_app_config")
    .select("deduct_stripe_fees_on_refund")
    .eq("id", 1)
    .single();
  const deductFees = cfg?.deduct_stripe_fees_on_refund ?? false;
  const isCard = d.payment_method === "CARD";

  // Stripe fee is only withheld once (on the first refund of a card donation).
  let stripeFeesCents = 0;
  if (deductFees && isCard && alreadyRefunded === 0) {
    stripeFeesCents = Math.round(gross * 0.029) + 30;
  }
  const suggestedCents = Math.max(0, remaining - stripeFeesCents);

  return NextResponse.json({
    grossCents: gross,
    alreadyRefundedCents: alreadyRefunded,
    remainingCents: remaining,
    deductStripeFees: deductFees,
    stripeFeesCents,
    suggestedCents,
    isCard,
    status: d.status,
  });
}

/**
 * POST — execute a refund.
 * Card → Stripe refund against the PaymentIntent. Manual → tracked-only.
 * Refunds are recorded in donation.metadata (no eckcm_refunds row, since that
 * table is keyed on registration payments).
 * Body: { amountCents?, reason? }   (amountCents omitted ⇒ full remaining)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { amountCents, reason } = (await request.json().catch(() => ({}))) as {
    amountCents?: number;
    reason?: string;
  };

  if (
    amountCents !== undefined &&
    (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0)
  ) {
    return NextResponse.json({ error: "amountCents must be a positive integer" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: d } = await admin
    .from("eckcm_donations")
    .select("id, amount_cents, fee_cents, payment_method, status, stripe_payment_intent_id, metadata")
    .eq("id", id)
    .single();
  if (!d) return NextResponse.json({ error: "Donation not found" }, { status: 404 });

  if (d.status !== "SUCCEEDED" && d.status !== "PARTIALLY_REFUNDED") {
    return NextResponse.json(
      { error: `Cannot refund a donation with status: ${d.status}` },
      { status: 400 }
    );
  }

  const meta = (d.metadata as DonationMeta | null) ?? {};
  const { gross, alreadyRefunded, remaining } = refundState(d.amount_cents, d.fee_cents, meta);

  const refundAmount = amountCents ?? remaining;
  if (refundAmount <= 0 || refundAmount > remaining) {
    return NextResponse.json(
      { error: `Invalid refund amount. Remaining refundable: ${remaining} cents.` },
      { status: 400 }
    );
  }

  const isCard = d.payment_method === "CARD";
  let stripeRefundId: string | undefined;

  if (isCard) {
    if (!d.stripe_payment_intent_id) {
      return NextResponse.json(
        { error: "No Stripe PaymentIntent on this donation" },
        { status: 400 }
      );
    }
    try {
      const { data: event } = await admin
        .from("eckcm_events")
        .select("stripe_mode")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      const stripeMode = (event?.stripe_mode as "test" | "live") ?? "test";
      const stripe = await getStripeForMode(stripeMode);
      const refund = await stripe.refunds.create({
        payment_intent: d.stripe_payment_intent_id,
        amount: refundAmount,
        reason: "requested_by_customer",
      });
      stripeRefundId = refund.id;
    } catch (err) {
      logger.error("[admin/donations/refund] Stripe refund failed", {
        donationId: id,
        error: String(err),
      });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Stripe refund failed" },
        { status: 502 }
      );
    }
  }

  const newTotal = alreadyRefunded + refundAmount;
  const status = newTotal >= gross ? "REFUNDED" : "PARTIALLY_REFUNDED";
  const refunds = Array.isArray(meta.refunds) ? meta.refunds : [];
  refunds.push({
    amount_cents: refundAmount,
    stripe_refund_id: stripeRefundId ?? null,
    reason: reason || "Admin refund",
    refunded_by: auth.user.id,
    at: new Date().toISOString(),
  });

  const { error: updateError } = await admin
    .from("eckcm_donations")
    .update({
      status,
      metadata: { ...meta, refunds, total_refunded_cents: newTotal },
    })
    .eq("id", id);

  if (updateError) {
    // Stripe refund already issued — surface the mismatch loudly for manual repair.
    logger.error("[admin/donations/refund] DB update failed AFTER refund", {
      donationId: id,
      stripeRefundId,
      error: updateError.message,
    });
    return NextResponse.json(
      { error: "Refund issued but failed to record. Contact an engineer.", stripeRefundId },
      { status: 500 }
    );
  }

  await admin.from("eckcm_audit_logs").insert({
    user_id: auth.user.id,
    action: isCard ? "DONATION_REFUND_STRIPE" : "DONATION_REFUND_MANUAL",
    entity_type: "donation",
    entity_id: id,
    new_data: {
      amount_cents: refundAmount,
      stripe_refund_id: stripeRefundId ?? null,
      status,
      payment_method: d.payment_method,
      reason: reason || null,
    },
  });

  return NextResponse.json({
    success: true,
    status,
    amountCents: refundAmount,
    ...(stripeRefundId ? { stripeRefundId } : {}),
  });
}
