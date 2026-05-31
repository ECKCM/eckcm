import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAuditLog } from "@/lib/services/audit.service";
import { getStripeForMode } from "@/lib/stripe/config";
import {
  createRefundWithGuard,
  getRefundSummary,
  RefundOverLimitError,
} from "@/lib/services/refund.service";
import {
  getAdjustmentsWithSummary,
  createAdjustment,
} from "@/lib/services/adjustment.service";
import {
  calculateProcessingFee,
  calculateProportionalProcessingFee,
  MIN_REFUND_CENTS,
} from "@/app/(admin)/admin/registrations/registrations-types";
import { sendRefundEmail } from "@/lib/email/send-refund";
import { logger } from "@/lib/logger";
import type { AdjustmentType, AdjustmentAction } from "@/lib/types/database";

const VALID_TYPES: AdjustmentType[] = [
  "date_change",
  "option_change",
  "discount",
  "cancellation",
  "admin_correction",
];
const VALID_ACTIONS: AdjustmentAction[] = [
  "charge",
  "refund",
  "credit",
  "waive",
  "pending",
];

// ─── GET: List adjustments with summary ───
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: registrationId } = await params;
  const admin = createAdminClient();

  const result = await getAdjustmentsWithSummary(admin, registrationId);
  return NextResponse.json(result);
}

// ─── POST: Create new adjustment ───
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { user } = auth;
  const { id: registrationId } = await params;

  let body: {
    adjustment_type: AdjustmentType;
    new_amount: number;
    action_taken: AdjustmentAction;
    reason: string;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { adjustment_type, new_amount, action_taken, reason, metadata } = body;

  // Validation
  if (!VALID_TYPES.includes(adjustment_type)) {
    return NextResponse.json(
      {
        error: `Invalid adjustment_type. Must be one of: ${VALID_TYPES.join(", ")}`,
      },
      { status: 400 }
    );
  }
  if (!VALID_ACTIONS.includes(action_taken)) {
    return NextResponse.json(
      {
        error: `Invalid action_taken. Must be one of: ${VALID_ACTIONS.join(", ")}`,
      },
      { status: 400 }
    );
  }
  if (
    typeof new_amount !== "number" ||
    !Number.isInteger(new_amount) ||
    new_amount < 0
  ) {
    return NextResponse.json(
      { error: "new_amount must be a non-negative integer (cents)" },
      { status: 400 }
    );
  }
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return NextResponse.json(
      { error: "reason is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Load registration + event stripe_mode
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("id, event_id, total_amount_cents, eckcm_events!inner(stripe_mode)")
    .eq("id", registrationId)
    .single();

  if (!reg) {
    return NextResponse.json(
      { error: "Registration not found" },
      { status: 404 }
    );
  }

  // new_amount is admin's intent for the new registration total.
  // refundAmountCents is the GROSS drop (admin's intent), not the customer-received amount.
  const currentAmount = reg.total_amount_cents;
  const refundAmountCents = currentAmount - new_amount;

  // ─── Stripe refund prep (action=refund only) ───
  let stripeRefundId: string | undefined;
  let paymentMethod: string | null = null;
  let cappedRefundAmount: number | undefined;
  let isManualRefund = false;
  let paymentRow:
    | {
        id: string;
        stripe_payment_intent_id: string | null;
        payment_method: string | null;
        amount_cents: number;
        invoice_id: string | null;
      }
    | null = null;
  let stripeModeForRefund: "test" | "live" = "test";

  if (action_taken === "refund" && refundAmountCents > 0) {
    const events = reg.eckcm_events as unknown as { stripe_mode: string } | null;
    stripeModeForRefund = (events?.stripe_mode as "test" | "live") ?? "test";

    // Find the most recent SUCCEEDED Stripe payment for this registration
    const { data: invoices } = await admin
      .from("eckcm_invoices")
      .select("id")
      .eq("registration_id", registrationId);

    const invoiceIds = (invoices ?? []).map((i: { id: string }) => i.id);

    if (invoiceIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "No payment found for this registration. Use 'pending' action for manual tracking.",
        },
        { status: 400 }
      );
    }

    const { data: payment } = await admin
      .from("eckcm_payments")
      .select(
        "id, stripe_payment_intent_id, payment_method, amount_cents, status, invoice_id"
      )
      .in("invoice_id", invoiceIds)
      .in("status", ["SUCCEEDED", "PARTIALLY_REFUNDED"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!payment) {
      return NextResponse.json(
        {
          error:
            "No succeeded payment found. Use 'pending' action for manual tracking.",
        },
        { status: 400 }
      );
    }
    // Zelle/Check/Manual: no Stripe PaymentIntent. Don't block — we still record
    // the refund (money returned out-of-band) and skip the Stripe call below.
    isManualRefund = !payment.stripe_payment_intent_id;

    paymentRow = payment;
    paymentMethod =
      payment.payment_method ?? (isManualRefund ? "MANUAL" : "CARD");

    // Customer-received refund = gross intent − proportional fee.
    // Stripe doesn't refund fees on partials, so the church withholds the fee share
    // of the refunded portion; the customer effectively pays it.
    const { summary } = await getAdjustmentsWithSummary(admin, registrationId);
    const feeBase =
      summary.original_amount > 0 ? summary.original_amount : payment.amount_cents;
    const totalFee = calculateProcessingFee(feeBase, paymentMethod);
    const proportionalFee = calculateProportionalProcessingFee(
      refundAmountCents,
      feeBase,
      paymentMethod
    );
    const customerRefund = Math.max(0, refundAmountCents - proportionalFee);

    // Cap: cumulative customer-received refunds never exceed (payment − full fee).
    // Use eckcm_refunds totals (customer-received) — adjustment.difference is gross
    // and would over-deduct here.
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
  }

  // ─── Step 1: Create adjustment row (updates total_amount_cents via optimistic lock) ───
  // Doing this BEFORE Stripe so a DB-side failure doesn't burn a real refund.
  let adjustment;
  try {
    adjustment = await createAdjustment(admin, {
      registrationId,
      adjustmentType: adjustment_type,
      newAmount: new_amount,
      actionTaken: action_taken,
      reason: reason.trim(),
      adjustedBy: user.id,
      metadata: metadata ?? {},
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to create adjustment",
      },
      { status: 500 }
    );
  }

  // ─── Step 2 + 3: Stripe refund flow (rollback adjustment on failure) ───
  if (
    action_taken === "refund" &&
    refundAmountCents > 0 &&
    paymentRow &&
    cappedRefundAmount &&
    cappedRefundAmount > 0
  ) {
    const payment = paymentRow;
    const refundAmount = cappedRefundAmount;

    // Reserve refund slot in DB (validates payment-level over-refund)
    let refundId: string;
    try {
      const result = await createRefundWithGuard(admin, {
        paymentId: payment.id,
        paymentAmountCents: payment.amount_cents,
        amountCents: refundAmount,
        reason: reason.trim(),
        refundedBy: user.id,
      });
      refundId = result.refundId;
    } catch (err) {
      // Rollback adjustment row + total_amount_cents
      await rollbackAdjustment(admin, {
        adjustmentId: adjustment.id,
        registrationId,
        previousAmount: adjustment.previous_amount,
        newAmount: new_amount,
      });
      if (err instanceof RefundOverLimitError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      logger.error("[adjustments/create] Refund guard failed", {
        error: String(err),
      });
      return NextResponse.json(
        { error: "Failed to validate refund" },
        { status: 500 }
      );
    }

    // Call Stripe (idempotency keyed on adjustment id — retry-safe).
    // Skipped for manual payments — there's no PaymentIntent to refund.
    if (!isManualRefund) {
      try {
        const stripe = await getStripeForMode(stripeModeForRefund);
        const refund = await stripe.refunds.create(
          {
            payment_intent: payment.stripe_payment_intent_id!,
            amount: refundAmount,
            reason: "requested_by_customer",
          },
          { idempotencyKey: `adj-${adjustment.id}` }
        );
        stripeRefundId = refund.id;
      } catch (err) {
        // Stripe failed — rollback refund row AND adjustment row
        await admin.from("eckcm_refunds").delete().eq("id", refundId);
        await rollbackAdjustment(admin, {
          adjustmentId: adjustment.id,
          registrationId,
          previousAmount: adjustment.previous_amount,
          newAmount: new_amount,
        });
        logger.error(
          "[adjustments/create] Stripe refund failed, DB rolled back",
          { error: String(err) }
        );
        return NextResponse.json(
          {
            error: err instanceof Error ? err.message : "Stripe refund failed",
          },
          { status: 500 }
        );
      }
    }

    // Refund recorded — finalize DB state. Failures here are logged but NOT
    // rolled back: the refund is a fact. (Manual refunds have no stripe_refund_id.)
    try {
      if (!isManualRefund) {
        await admin
          .from("eckcm_refunds")
          .update({ stripe_refund_id: stripeRefundId })
          .eq("id", refundId);

        await admin
          .from("eckcm_registration_adjustments")
          .update({ stripe_refund_id: stripeRefundId })
          .eq("id", adjustment.id);
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
      // The remaining cents on the payment are just the non-refundable fee.
      const stripeFee = calculateProcessingFee(payment.amount_cents, paymentMethod);
      const fullyRefunded = postSummary.remainingCents <= stripeFee;
      if (refundStatus === "REFUNDED" || fullyRefunded || new_amount === 0) {
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
        "[adjustments/create] Stripe refund SUCCEEDED but DB finalize partial — manual verification recommended",
        {
          adjustmentId: adjustment.id,
          refundId,
          stripeRefundId,
          error: String(finalizeErr),
        }
      );
      // Don't return error — refund is real, ledger row exists; minor status drift is acceptable
    }
  }

  // ─── Audit log ───
  await writeAuditLog(admin, {
    event_id: reg.event_id,
    user_id: user.id,
    action: "ADMIN_ADJUSTMENT_CREATED",
    entity_type: "registration",
    entity_id: registrationId,
    new_data: {
      adjustment_id: adjustment.id,
      adjustment_type,
      previous_amount: adjustment.previous_amount,
      new_amount: adjustment.new_amount,
      difference: adjustment.difference,
      action_taken,
      reason: reason.trim(),
      stripe_refund_id: stripeRefundId ?? null,
      customer_received_cents: cappedRefundAmount ?? null,
      payment_method: paymentMethod,
    },
  });

  // ─── Send refund email in background ───
  if (action_taken === "refund" && cappedRefundAmount && cappedRefundAmount > 0) {
    const isFullRefund = new_amount === 0;
    after(
      sendRefundEmail({
        registrationId,
        refundAmountCents: cappedRefundAmount,
        reason: reason.trim(),
        isFullRefund,
        paymentMethod,
        sentBy: user.id,
      })
    );
  }

  return NextResponse.json({ adjustment, success: true });
}

// ─── Rollback helper: undo createAdjustment after a downstream failure ───
async function rollbackAdjustment(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    adjustmentId: string;
    registrationId: string;
    previousAmount: number;
    newAmount: number;
  }
): Promise<void> {
  // Restore total_amount_cents, but only if still at the value we set
  // (defends against another adjustment racing on the same registration).
  const { data: restored } = await admin
    .from("eckcm_registrations")
    .update({ total_amount_cents: params.previousAmount })
    .eq("id", params.registrationId)
    .eq("total_amount_cents", params.newAmount)
    .select("id");

  if (!restored?.length) {
    logger.error("[adjustments/rollback] total_amount_cents drift — manual cleanup needed", {
      registrationId: params.registrationId,
      adjustmentId: params.adjustmentId,
      expectedTotal: params.newAmount,
      restoredTo: params.previousAmount,
    });
  }

  await admin
    .from("eckcm_registration_adjustments")
    .delete()
    .eq("id", params.adjustmentId);
}
