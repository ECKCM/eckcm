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
import { getPrimaryInvoiceId } from "@/lib/services/invoice.service";
import {
  calculateProcessingFee,
  calculateProportionalProcessingFee,
  MIN_REFUND_CENTS,
} from "@/app/(admin)/admin/registrations/registrations-types";
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

  // 2. Resolve event's Stripe mode + payment_method (best-effort)
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
  let cappedRefundAmount: number | undefined;

  // 3. Execute Stripe operations for action=refund (negative difference = refund)
  if (action === "refund" && adj.difference < 0) {
    // Refund targets the registration's ORIGINAL payment (the primary invoice).
    // Custom-charge invoices add their own paid MANUAL payment that must never be
    // selected here, or a card refund would silently become a manual no-op.
    const primaryInvoiceId = await getPrimaryInvoiceId(admin, registrationId);

    if (!primaryInvoiceId) {
      return NextResponse.json(
        {
          error:
            "No payment found for this registration. Mark as waive/credit for manual tracking.",
        },
        { status: 400 }
      );
    }

    const { data: payment } = await admin
      .from("eckcm_payments")
      .select(
        "id, stripe_payment_intent_id, payment_method, amount_cents, status, invoice_id"
      )
      .eq("invoice_id", primaryInvoiceId)
      .in("status", ["SUCCEEDED", "PARTIALLY_REFUNDED"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!payment) {
      return NextResponse.json(
        {
          error:
            "No succeeded payment found. Mark as waive/credit for manual tracking.",
        },
        { status: 400 }
      );
    }
    // Zelle/Check/Manual payments have no Stripe PaymentIntent. We don't call
    // Stripe — the money is returned out-of-band (admin Zelles it back / voids
    // the check). We only RECORD the refund so status/ledger/email/audit flow.
    const isManual = !payment.stripe_payment_intent_id;

    paymentMethod = payment.payment_method ?? (isManual ? "MANUAL" : "CARD");

    // Pending adjustments store the GROSS refund (admin's typed amount).
    // Apply proportional fee to compute the customer-received refund, same as
    // the direct-refund creation flow — the church withholds the fee share
    // of the refunded portion since Stripe doesn't refund fees on partials.
    const { summary } = await getAdjustmentsWithSummary(admin, registrationId);
    const feeBase =
      summary.original_amount > 0 ? summary.original_amount : payment.amount_cents;
    const grossRefund = Math.abs(adj.difference);
    const totalFee = calculateProcessingFee(feeBase, paymentMethod);
    const proportionalFee = calculateProportionalProcessingFee(
      grossRefund,
      feeBase,
      paymentMethod
    );
    const customerRefund = Math.max(0, grossRefund - proportionalFee);

    // Cap based on customer-received refunds already issued (sum of eckcm_refunds),
    // not adjustment.difference (which is gross and would over-deduct).
    const preRefundSummary = await getRefundSummary(
      admin,
      payment.id,
      payment.amount_cents
    );
    const maxTotalRefundable = Math.max(
      0,
      feeBase - totalFee - preRefundSummary.totalRefundedCents
    );
    cappedRefundAmount = Math.min(customerRefund, maxTotalRefundable);

    if (cappedRefundAmount <= 0) {
      return NextResponse.json(
        {
          error:
            "No refundable amount remaining (processing fee already exceeds balance)",
        },
        { status: 400 }
      );
    }
    if (cappedRefundAmount < MIN_REFUND_CENTS) {
      return NextResponse.json(
        {
          error: `Minimum refund is ${(MIN_REFUND_CENTS / 100).toFixed(2)} to customer`,
        },
        { status: 400 }
      );
    }

    // Step 1: Reserve refund slot in DB (validates payment-level limits)
    let refundId: string;
    try {
      const result = await createRefundWithGuard(admin, {
        paymentId: payment.id,
        paymentAmountCents: payment.amount_cents,
        amountCents: cappedRefundAmount,
        reason: adj.reason,
        refundedBy: user.id,
      });
      refundId = result.refundId;
    } catch (err) {
      if (err instanceof RefundOverLimitError) {
        return NextResponse.json(
          { error: err.message },
          { status: 409 }
        );
      }
      logger.error("[adjustments/process] Refund guard failed", {
        error: String(err),
      });
      return NextResponse.json(
        { error: "Failed to validate refund" },
        { status: 500 }
      );
    }

    // Step 2: Issue Stripe refund (idempotency keyed on adjustment id).
    // Skipped for manual payments — there's no PaymentIntent to refund.
    if (!isManual) {
      try {
        const stripe = await getStripeForMode(stripeMode);
        const refund = await stripe.refunds.create(
          {
            payment_intent: payment.stripe_payment_intent_id,
            amount: cappedRefundAmount,
            reason: "requested_by_customer",
          },
          { idempotencyKey: `adj-${adjustmentId}` }
        );
        stripeRefundId = refund.id;
      } catch (err) {
        // Stripe failed — rollback the DB refund record
        await admin.from("eckcm_refunds").delete().eq("id", refundId);
        logger.error(
          "[adjustments/process] Stripe refund failed, refund row rolled back",
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

    // Refund recorded — finalize DB. Failures here are logged but not rolled
    // back: the refund is a fact. (Manual refunds have no stripe_refund_id.)
    try {
      if (!isManual) {
        await admin
          .from("eckcm_refunds")
          .update({ stripe_refund_id: stripeRefundId })
          .eq("id", refundId);
      }

      const postSummary = await getRefundSummary(
        admin,
        payment.id,
        payment.amount_cents
      );
      const refundStatus =
        postSummary.remainingCents <= 0 ? "REFUNDED" : "PARTIALLY_REFUNDED";

      await admin
        .from("eckcm_payments")
        .update({ status: refundStatus })
        .eq("id", payment.id);

      if (payment.invoice_id) {
        await admin
          .from("eckcm_invoices")
          .update({ status: refundStatus })
          .eq("id", payment.invoice_id);
      }

      // Full refund: customer received the max possible (payment − fee).
      // For card payments, the remaining cents on the payment are just the
      // non-refundable processing fee.
      const stripeFee = calculateProcessingFee(payment.amount_cents, paymentMethod);
      const fullyRefunded = postSummary.remainingCents <= stripeFee;
      if (refundStatus === "REFUNDED" || fullyRefunded || adj.new_amount === 0) {
        await admin
          .from("eckcm_registrations")
          .update({ status: "REFUNDED" })
          .eq("id", registrationId);

        await admin
          .from("eckcm_epass_tokens")
          .update({ is_active: false })
          .eq("registration_id", registrationId);
      }
    } catch (finalizeErr) {
      logger.error(
        "[adjustments/process] Stripe refund SUCCEEDED but DB finalize partial — manual verification recommended",
        {
          adjustmentId,
          refundId,
          stripeRefundId,
          error: String(finalizeErr),
        }
      );
      // Don't return error — refund is real
    }
  }

  // 4. Update adjustment row (action_taken + stripe_refund_id)
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
      customer_received_cents: cappedRefundAmount ?? null,
      payment_method: paymentMethod,
    },
  });

  // 6. Send refund email in background (non-blocking)
  if (action === "refund" && cappedRefundAmount && cappedRefundAmount > 0) {
    const isFullRefund = adj.new_amount === 0;
    after(
      sendRefundEmail({
        registrationId,
        refundAmountCents: cappedRefundAmount,
        reason: adj.reason,
        isFullRefund,
        paymentMethod,
        sentBy: user.id,
      })
    );
  }

  return NextResponse.json({ success: true, action });
}
