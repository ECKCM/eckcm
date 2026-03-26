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
import { calculateProcessingFee } from "@/app/(admin)/admin/registrations/registrations-types";
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

  // Verify registration exists + load event stripe_mode and payment_method
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("id, event_id, total_amount_cents, payment_method, eckcm_events!inner(stripe_mode)")
    .eq("id", registrationId)
    .single();

  if (!reg) {
    return NextResponse.json(
      { error: "Registration not found" },
      { status: 404 }
    );
  }

  // Calculate refund amount (difference between current total and new amount)
  const currentAmount = reg.total_amount_cents;
  const refundAmountCents = currentAmount - new_amount; // positive when refunding

  // ─── Stripe refund for direct "refund" action ───
  let stripeRefundId: string | undefined;
  let paymentMethod: string | null = reg.payment_method ?? null;

  if (action_taken === "refund" && refundAmountCents > 0) {
    const events = reg.eckcm_events as unknown as { stripe_mode: string } | null;
    const stripeMode = (events?.stripe_mode as "test" | "live") ?? "test";

    // Cap refund at processing fee limit
    const { summary } = await getAdjustmentsWithSummary(admin, registrationId);
    const feeBase = summary.original_amount > 0 ? summary.original_amount : currentAmount;
    const fee = calculateProcessingFee(feeBase, paymentMethod);
    const cappedRefundAmount = fee > 0
      ? Math.min(refundAmountCents, Math.max(0, feeBase - fee - summary.total_refunded))
      : refundAmountCents;

    if (cappedRefundAmount <= 0) {
      return NextResponse.json(
        { error: "No refundable amount remaining (processing fee already exceeds balance)" },
        { status: 400 }
      );
    }

    // Find the most recent SUCCEEDED Stripe payment for this registration
    const { data: invoices } = await admin
      .from("eckcm_invoices")
      .select("id")
      .eq("registration_id", registrationId);

    const invoiceIds = (invoices ?? []).map((i: { id: string }) => i.id);

    if (invoiceIds.length > 0) {
      const { data: payment } = await admin
        .from("eckcm_payments")
        .select("id, stripe_payment_intent_id, payment_method, amount_cents, status, invoice_id")
        .in("invoice_id", invoiceIds)
        .in("status", ["SUCCEEDED", "PARTIALLY_REFUNDED"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (payment) {
        paymentMethod = payment.payment_method;

        if (payment.stripe_payment_intent_id) {
          // Issue Stripe refund
          try {
            const stripe = await getStripeForMode(stripeMode);
            const refund = await stripe.refunds.create({
              payment_intent: payment.stripe_payment_intent_id,
              amount: cappedRefundAmount,
              reason: "requested_by_customer",
            });
            stripeRefundId = refund.id;

            // Record refund in eckcm_refunds with race-condition guard
            await createRefundWithGuard(admin, {
              paymentId: payment.id,
              paymentAmountCents: payment.amount_cents,
              amountCents: cappedRefundAmount,
              stripeRefundId: refund.id,
              reason: reason.trim(),
              refundedBy: user.id,
            });

            // Update payment & invoice status
            const postSummary = await getRefundSummary(admin, payment.id, payment.amount_cents);
            const refundStatus = postSummary.remainingCents <= 0 ? "REFUNDED" : "PARTIALLY_REFUNDED";

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
              return NextResponse.json({ error: err.message }, { status: 409 });
            }
            logger.error("[adjustments/create] Stripe refund failed", { error: String(err) });
            return NextResponse.json(
              { error: err instanceof Error ? err.message : "Stripe refund failed" },
              { status: 500 }
            );
          }
        }
      }
    }
  }

  try {
    const adjustment = await createAdjustment(admin, {
      registrationId,
      adjustmentType: adjustment_type,
      newAmount: new_amount,
      actionTaken: action_taken,
      reason: reason.trim(),
      adjustedBy: user.id,
      metadata: metadata ?? {},
      stripeRefundId,
    });

    // Audit log
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
      },
    });

    // Send refund email in background (non-blocking)
    if (action_taken === "refund" && refundAmountCents > 0) {
      const isFullRefund = new_amount === 0;
      after(
        sendRefundEmail({
          registrationId,
          refundAmountCents,
          reason: reason.trim(),
          isFullRefund,
          paymentMethod,
          sentBy: user.id,
        })
      );
    }

    return NextResponse.json({ adjustment, success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create adjustment" },
      { status: 500 }
    );
  }
}
