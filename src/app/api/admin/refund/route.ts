import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { getRefundSummary, createRefundWithGuard, RefundOverLimitError } from "@/lib/services/refund.service";
import { sendRefundEmail } from "@/lib/email/send-refund";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth/admin";

interface RefundBody {
  paymentId: string;
  amountCents?: number; // If omitted, full refund
  reason?: string;
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = auth;

  // 3. Parse body
  let body: RefundBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { paymentId, amountCents, reason } = body;

  if (!paymentId || typeof paymentId !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid paymentId" },
      { status: 400 }
    );
  }

  // Validate amountCents if provided: must be a positive integer
  if (amountCents !== undefined) {
    if (
      typeof amountCents !== "number" ||
      !Number.isFinite(amountCents) ||
      !Number.isInteger(amountCents) ||
      amountCents <= 0
    ) {
      return NextResponse.json(
        { error: "amountCents must be a positive integer" },
        { status: 400 }
      );
    }
  }

  const admin = createAdminClient();

  // 4. Load payment record
  const { data: payment } = await admin
    .from("eckcm_payments")
    .select("id, stripe_payment_intent_id, payment_method, amount_cents, status, invoice_id")
    .eq("id", paymentId)
    .single();

  if (!payment) {
    return NextResponse.json(
      { error: "Payment not found" },
      { status: 404 }
    );
  }

  if (payment.status !== "SUCCEEDED" && payment.status !== "PARTIALLY_REFUNDED") {
    return NextResponse.json(
      { error: `Cannot refund a payment with status: ${payment.status}` },
      { status: 400 }
    );
  }

  // 5. Compute remaining refundable amount
  const { totalRefundedCents, remainingCents } = await getRefundSummary(
    admin,
    payment.id,
    payment.amount_cents
  );

  const refundAmount = amountCents ?? remainingCents;
  if (refundAmount <= 0 || refundAmount > remainingCents) {
    return NextResponse.json(
      {
        error: `Invalid refund amount. Remaining: $${(remainingCents / 100).toFixed(2)} (already refunded: $${(totalRefundedCents / 100).toFixed(2)} of $${(payment.amount_cents / 100).toFixed(2)})`,
      },
      { status: 400 }
    );
  }

  // 6. Resolve event info for Stripe mode + registration ID for email
  let eventId: string | null = null;
  let registrationId: string | null = null;
  let stripeMode: "test" | "live" = "test";

  if (payment.invoice_id) {
    const { data: inv } = await admin
      .from("eckcm_invoices")
      .select("registration_id")
      .eq("id", payment.invoice_id)
      .single();

    if (inv?.registration_id) {
      registrationId = inv.registration_id;
      const { data: reg } = await admin
        .from("eckcm_registrations")
        .select("event_id, eckcm_events!inner(stripe_mode)")
        .eq("id", inv.registration_id)
        .single();

      if (reg) {
        eventId = reg.event_id;
        const events = reg.eckcm_events as unknown as { stripe_mode: string } | null;
        stripeMode = (events?.stripe_mode as "test" | "live") ?? "test";
      }
    }
  }

  const refundReason = reason || "Admin-initiated refund";
  let stripeRefundId: string | undefined;

  // 7. For Stripe payments: validate via DB guard FIRST, then issue Stripe refund
  if (payment.stripe_payment_intent_id) {
    // Step 1: Reserve refund slot in DB (validates limits before touching Stripe)
    let refundId: string;
    try {
      const result = await createRefundWithGuard(admin, {
        paymentId: payment.id,
        paymentAmountCents: payment.amount_cents,
        amountCents: refundAmount,
        reason: refundReason,
        refundedBy: user.id,
      });
      refundId = result.refundId;
    } catch (err) {
      if (err instanceof RefundOverLimitError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      logger.error("[admin/refund] Refund guard failed", { error: String(err) });
      return NextResponse.json(
        { error: "Failed to validate refund" },
        { status: 500 }
      );
    }

    // Step 2: Issue Stripe refund (DB slot already reserved)
    try {
      const stripe = await getStripeForMode(stripeMode);
      const stripeRefund = await stripe.refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        amount: refundAmount,
        reason: "requested_by_customer",
      });
      stripeRefundId = stripeRefund.id;

      // Step 3: Update DB record with Stripe refund ID
      await admin
        .from("eckcm_refunds")
        .update({ stripe_refund_id: stripeRefund.id })
        .eq("id", refundId);

      // Audit log
      await admin.from("eckcm_audit_logs").insert({
        event_id: eventId,
        user_id: user.id,
        action: "ADMIN_REFUND_INITIATED",
        entity_type: "payment",
        entity_id: payment.id,
        new_data: {
          stripe_refund_id: stripeRefund.id,
          amount_cents: refundAmount,
          reason: refundReason,
          is_full_refund: refundAmount === remainingCents,
        },
      });
    } catch (err) {
      // Stripe failed — rollback the DB refund record
      await admin.from("eckcm_refunds").delete().eq("id", refundId);
      logger.error("[admin/refund] Stripe refund failed, DB record rolled back", { error: String(err) });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Stripe refund failed" },
        { status: 500 }
      );
    }
  } else {
    // 8. For non-Stripe payments (Zelle, Check, Manual)
    try {
      await createRefundWithGuard(admin, {
        paymentId: payment.id,
        paymentAmountCents: payment.amount_cents,
        amountCents: refundAmount,
        reason: refundReason,
        refundedBy: user.id,
      });
    } catch (err) {
      if (err instanceof RefundOverLimitError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      logger.error("[admin/refund] Refund record creation failed", { error: String(err) });
      return NextResponse.json(
        { error: "Failed to create refund record" },
        { status: 500 }
      );
    }

    // Audit log for manual refund
    await admin.from("eckcm_audit_logs").insert({
      event_id: eventId,
      user_id: user.id,
      action: "ADMIN_REFUND_MANUAL",
      entity_type: "payment",
      entity_id: payment.id,
      new_data: {
        amount_cents: refundAmount,
        reason: refundReason,
        payment_method: payment.payment_method,
      },
    });
  }

  // 9. Update payment/invoice/registration status (runs for BOTH Stripe and non-Stripe)
  const postRefundSummary = await getRefundSummary(admin, payment.id, payment.amount_cents);
  const refundStatus = postRefundSummary.remainingCents <= 0 ? "REFUNDED" : "PARTIALLY_REFUNDED";

  await admin
    .from("eckcm_payments")
    .update({ status: refundStatus })
    .eq("id", payment.id);

  if (payment.invoice_id) {
    await admin
      .from("eckcm_invoices")
      .update({ status: refundStatus })
      .eq("id", payment.invoice_id);

    if (refundStatus === "REFUNDED" && registrationId) {
      await admin
        .from("eckcm_registrations")
        .update({ status: "REFUNDED" })
        .eq("id", registrationId);

      await admin
        .from("eckcm_epass_tokens")
        .update({ is_active: false })
        .eq("registration_id", registrationId);
    }
  }

  // 10. Send refund email in background (non-blocking)
  if (registrationId) {
    const isFullRefund = refundStatus === "REFUNDED";
    after(
      sendRefundEmail({
        registrationId,
        refundAmountCents: refundAmount,
        reason: refundReason,
        isFullRefund,
        paymentMethod: payment.payment_method,
        sentBy: user.id,
      })
    );
  }

  return NextResponse.json({
    success: true,
    ...(stripeRefundId ? { refundId: stripeRefundId } : {}),
    amountCents: refundAmount,
    status: refundStatus,
  });
}
