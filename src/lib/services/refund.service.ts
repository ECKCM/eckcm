import { SupabaseClient } from "@supabase/supabase-js";

export interface RefundRecord {
  id: string;
  stripe_refund_id: string | null;
  amount_cents: number;
  reason: string | null;
  refunded_by: string | null;
  created_at: string;
}

export interface RefundSummary {
  totalRefundedCents: number;
  remainingCents: number;
  refunds: RefundRecord[];
}

/**
 * Get the total amount already refunded for a payment and the remaining refundable balance.
 */
export async function getRefundSummary(
  admin: SupabaseClient,
  paymentId: string,
  paymentAmountCents: number
): Promise<RefundSummary> {
  const { data: refunds } = await admin
    .from("eckcm_refunds")
    .select("id, stripe_refund_id, amount_cents, reason, refunded_by, created_at")
    .eq("payment_id", paymentId)
    .order("created_at", { ascending: true });

  const totalRefundedCents = (refunds ?? []).reduce(
    (sum: number, r: { amount_cents: number }) => sum + r.amount_cents,
    0
  );

  return {
    totalRefundedCents,
    remainingCents: paymentAmountCents - totalRefundedCents,
    refunds: (refunds ?? []) as RefundRecord[],
  };
}

/**
 * Insert a refund record and verify the total doesn't exceed payment amount (race condition guard).
 * If post-insert check fails, the inserted record is deleted and an error is thrown.
 */
export async function createRefundWithGuard(
  admin: SupabaseClient,
  params: {
    paymentId: string;
    paymentAmountCents: number;
    amountCents: number;
    stripeRefundId?: string;
    reason: string;
    refundedBy: string;
  }
): Promise<{ refundId: string }> {
  // 1. Insert refund record
  const { data: inserted, error: insertError } = await admin
    .from("eckcm_refunds")
    .insert({
      payment_id: params.paymentId,
      stripe_refund_id: params.stripeRefundId ?? null,
      amount_cents: params.amountCents,
      reason: params.reason,
      refunded_by: params.refundedBy,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error("Failed to create refund record");
  }

  // 2. Post-insert verification: re-sum all refunds to catch race conditions
  const { totalRefundedCents } = await getRefundSummary(
    admin,
    params.paymentId,
    params.paymentAmountCents
  );

  if (totalRefundedCents > params.paymentAmountCents) {
    // Race condition detected: total refunds exceed payment amount — rollback
    await admin.from("eckcm_refunds").delete().eq("id", inserted.id);
    throw new RefundOverLimitError(
      `Refund rejected: total refunds ($${(totalRefundedCents / 100).toFixed(2)}) would exceed payment amount ($${(params.paymentAmountCents / 100).toFixed(2)}). Another refund may have been processed concurrently.`
    );
  }

  return { refundId: inserted.id };
}

export class RefundOverLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefundOverLimitError";
  }
}
