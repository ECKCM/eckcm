import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { requireAdmin } from "@/lib/auth/admin";
import { sendDonationReceiptEmail } from "@/lib/email/send-donation-receipt";
import { logger } from "@/lib/logger";
import type Stripe from "stripe";

/**
 * POST /api/admin/donations/[id]/sync
 * Reconcile a CARD donation's status with the real Stripe PaymentIntent.
 * Local status can drift if the client-side confirm never completed even though
 * Stripe succeeded. On a PENDING→SUCCEEDED reconciliation, the receipt is sent.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: d } = await admin
    .from("eckcm_donations")
    .select("id, payment_method, status, stripe_payment_intent_id, metadata")
    .eq("id", id)
    .single();

  if (!d) {
    return NextResponse.json({ error: "Donation not found" }, { status: 404 });
  }
  if (d.payment_method !== "CARD" || !d.stripe_payment_intent_id) {
    return NextResponse.json(
      { error: "Only card donations can be synced from Stripe" },
      { status: 400 }
    );
  }

  // Stripe mode from the active event (same resolution as the donation flow).
  const { data: event } = await admin
    .from("eckcm_events")
    .select("stripe_mode")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const stripeMode = (event?.stripe_mode as "test" | "live") ?? "test";

  let pi: Stripe.PaymentIntent;
  try {
    const stripe = await getStripeForMode(stripeMode);
    pi = await stripe.paymentIntents.retrieve(d.stripe_payment_intent_id, {
      expand: ["latest_charge"],
    });
  } catch (err) {
    logger.error("[admin/donations/sync] Stripe retrieve failed", {
      donationId: id,
      error: String(err),
    });
    return NextResponse.json({ error: "Failed to retrieve PaymentIntent" }, { status: 502 });
  }

  // Map Stripe PI/charge state → donation status.
  let newStatus = d.status;
  if (pi.status === "succeeded") {
    const charge = pi.latest_charge as Stripe.Charge | null;
    if (charge?.refunded) newStatus = "REFUNDED";
    else if ((charge?.amount_refunded ?? 0) > 0) newStatus = "PARTIALLY_REFUNDED";
    else newStatus = "SUCCEEDED";
  } else if (pi.status === "canceled") {
    newStatus = "FAILED";
  } else {
    // requires_payment_method | requires_confirmation | requires_action | processing
    newStatus = "PENDING";
  }

  const wasSucceeded = d.status === "SUCCEEDED";
  const changed = newStatus !== d.status;

  if (changed) {
    await admin
      .from("eckcm_donations")
      .update({
        status: newStatus,
        metadata: {
          ...((d.metadata as Record<string, unknown> | null) ?? {}),
          stripe_status: pi.status,
          synced_at: new Date().toISOString(),
          synced_by: "admin",
        },
      })
      .eq("id", id);

    await admin.from("eckcm_audit_logs").insert({
      user_id: auth.user.id,
      action: "DONATION_SYNCED_FROM_STRIPE",
      entity_type: "donation",
      entity_id: id,
      new_data: { from: d.status, to: newStatus, stripe_status: pi.status },
    });
  }

  // Newly-confirmed → email the receipt (guarded/idempotent).
  if (newStatus === "SUCCEEDED" && !wasSucceeded) {
    after(async () => {
      try {
        await sendDonationReceiptEmail(id);
      } catch (err) {
        logger.error("[admin/donations/sync] Receipt send failed", {
          donationId: id,
          error: String(err),
        });
      }
    });
  }

  return NextResponse.json({
    success: true,
    status: newStatus,
    stripeStatus: pi.status,
    changed,
  });
}
