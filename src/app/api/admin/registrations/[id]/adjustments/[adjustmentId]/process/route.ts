import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import {
  createRefundWithGuard,
  getRefundSummary,
  RefundOverLimitError,
} from "@/lib/services/refund.service";
import {
  processAdjustment,
  getAdjustmentsWithSummary,
} from "@/lib/services/adjustment.service";
import { calculateProcessingFee } from "@/app/(admin)/admin/registrations/registrations-types";
import { writeAuditLog } from "@/lib/services/audit.service";
import { sendRefundEmail } from "@/lib/email/send-refund";
import { logger } from "@/lib/logger";
import type { AdjustmentAction } from "@/lib/types/database";

const PROCESSABLE_ACTIONS: AdjustmentAction[] = [
  "charge",
  "refund",
  "waive",
  "credit",
];

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; adjustmentId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { user } = auth;
  const { id: registrationId, adjustmentId } = await params;

  let body: { action: AdjustmentAction };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action } = body;
  if (!PROCESSABLE_ACTIONS.includes(action)) {
    return NextResponse.json(
      {
        error: `action must be one of: ${PROCESSABLE_ACTIONS.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1. Load adjustment
  const { data: adj } = await admin
    .from("eckcm_registration_adjustments")
    .select("*")
    .eq("id", adjustmentId)
    .eq("registration_id", registrationId)
    .single();

  if (!adj) {
    return NextResponse.json(
      { error: "Adjustment not found" },
      { status: 404 }
    );
  }
  if (adj.action_taken !== "pending") {
    return NextResponse.json(
      { error: `Adjustment already processed: ${adj.action_taken}` },
      { status: 400 }
    );
  }

  // 2. Resolve event's Stripe mode
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("event_id, eckcm_events!inner(stripe_mode)")
    .eq("id", registrationId)
    .single();

  const eventId = reg?.event_id ?? null;
  let paymentMethod: string | null = null;
  const events = reg?.eckcm_events as unknown as {
    stripe_mode: string;
  } | null;
  const stripeMode = (events?.stripe_mode as "test" | "live") ?? "test";

  let stripeRefundId: string | undefined;

  // 3. Execute Stripe operations based on action
  if (action === "refund" && adj.difference < 0) {
    // Find the most recent SUCCEEDED payment for this registration
    const { data: invoices } = await admin
      .from("eckcm_invoices")
      .select("id")
      .eq("registration_id", registrationId);

    const invoiceIds = (invoices ?? []).map(
      (i: { id: string }) => i.id
    );

    if (invoiceIds.length > 0) {
      const { data: payment } = await admin
        .from("eckcm_payments")
        .select(
          "id, stripe_payment_intent_id, payment_method, amount_cents, status"
        )
        .in("invoice_id", invoiceIds)
        .in("status", ["SUCCEEDED", "PARTIALLY_REFUNDED"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (payment) {
        paymentMethod = payment.payment_method;
      }

      // Cap refund at max refundable (processing fee is non-refundable)
      const { summary } = await getAdjustmentsWithSummary(admin, registrationId);
      const feeBase = summary.original_amount > 0 ? summary.original_amount : (adj.previous_amount + Math.abs(adj.difference));
      const fee = calculateProcessingFee(feeBase, paymentMethod);
      const rawRefundAmount = Math.abs(adj.difference);
      const cappedRefundAmount = fee > 0
        ? Math.min(rawRefundAmount, Math.max(0, feeBase - fee - summary.total_refunded))
        : rawRefundAmount;

      if (cappedRefundAmount <= 0) {
        return NextResponse.json(
          { error: "No refundable amount remaining (processing fee already exceeds balance)" },
          { status: 400 }
        );
      }

      if (payment?.stripe_payment_intent_id) {
        try {
          const stripe = await getStripeForMode(stripeMode);
          const refund = await stripe.refunds.create({
            payment_intent: payment.stripe_payment_intent_id,
            amount: cappedRefundAmount,
            reason: "requested_by_customer",
          });
          stripeRefundId = refund.id;

          await createRefundWithGuard(admin, {
            paymentId: payment.id,
            paymentAmountCents: payment.amount_cents,
            amountCents: cappedRefundAmount,
            stripeRefundId: refund.id,
            reason: adj.reason,
            refundedBy: user.id,
          });

          // Update payment & invoice status
          const postSummary = await getRefundSummary(admin, payment.id, payment.amount_cents);
          const refundStatus = postSummary.remainingCents <= 0 ? "REFUNDED" : "PARTIALLY_REFUNDED";

          await admin
            .from("eckcm_payments")
            .update({ status: refundStatus })
            .eq("id", payment.id);

          // Find invoice for this payment to update status
          const { data: paymentWithInvoice } = await admin
            .from("eckcm_payments")
            .select("invoice_id")
            .eq("id", payment.id)
            .single();

          if (paymentWithInvoice?.invoice_id) {
            await admin
              .from("eckcm_invoices")
              .update({ status: refundStatus })
              .eq("id", paymentWithInvoice.invoice_id);
          }

          // Full refund → update registration status & deactivate epass
          if (refundStatus === "REFUNDED") {
            await admin
              .from("eckcm_registrations")
              .update({ status: "REFUNDED" })
              .eq("id", registrationId);

            await admin
              .from("eckcm_epass_tokens")
              .update({ is_active: false })
              .eq("registration_id", registrationId);
          }
        } catch (err) {
          if (err instanceof RefundOverLimitError) {
            return NextResponse.json(
              { error: err.message },
              { status: 409 }
            );
          }
          logger.error(
            "[adjustments/process] Stripe refund failed",
            { error: String(err) }
          );
          return NextResponse.json(
            {
              error:
                err instanceof Error
                  ? err.message
                  : "Stripe refund failed",
            },
            { status: 500 }
          );
        }
      }
    }
  }

  // 4. Update adjustment record
  await processAdjustment(admin, adjustmentId, {
    actionTaken: action,
    stripeRefundId,
  });

  // 5. Audit log
  await writeAuditLog(admin, {
    event_id: eventId,
    user_id: user.id,
    action: "ADMIN_ADJUSTMENT_PROCESSED",
    entity_type: "registration",
    entity_id: registrationId,
    new_data: {
      adjustment_id: adjustmentId,
      action,
      difference: adj.difference,
      stripe_refund_id: stripeRefundId ?? null,
    },
  });

  // 6. Send refund email in background (non-blocking)
  if (action === "refund" && adj.difference < 0) {
    const refundAmountCents = Math.abs(adj.difference);
    const isFullRefund = adj.new_amount === 0;
    after(
      sendRefundEmail({
        registrationId,
        refundAmountCents,
        reason: adj.reason,
        isFullRefund,
        paymentMethod,
        sentBy: user.id,
      })
    );
  }

  return NextResponse.json({ success: true, action });
}
