import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdjustmentType, AdjustmentAction } from "@/lib/types/database";

// ─── Interfaces ───

export interface AdjustmentRecord {
  id: string;
  registration_id: string;
  adjustment_type: AdjustmentType;
  previous_amount: number;
  new_amount: number;
  difference: number;
  action_taken: AdjustmentAction;
  stripe_payment_intent_id: string | null;
  stripe_refund_id: string | null;
  reason: string;
  adjusted_by: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdjustmentWithUser extends AdjustmentRecord {
  adjusted_by_name: string;
}

export interface AdjustmentSummary {
  original_amount: number;
  current_amount: number;
  total_charged: number;
  total_refunded: number;
  total_waived: number;
  total_credited: number;
  net_balance: number;
  pending_count: number;
}

// ─── Functions ───

/**
 * Get all adjustments for a registration with adjuster name, ordered by created_at.
 */
export async function getAdjustments(
  admin: SupabaseClient,
  registrationId: string
): Promise<AdjustmentWithUser[]> {
  const { data, error } = await admin
    .from("eckcm_registration_adjustments")
    .select(
      `id, registration_id, adjustment_type,
       previous_amount, new_amount, difference,
       action_taken, stripe_payment_intent_id, stripe_refund_id,
       reason, adjusted_by, metadata, created_at`
    )
    .eq("registration_id", registrationId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  // Batch-load adjuster names
  const userIds = [...new Set(data.map((a: AdjustmentRecord) => a.adjusted_by))];
  const { data: profiles } = await admin
    .from("eckcm_profiles")
    .select("id, display_name_en")
    .in("id", userIds);

  const nameMap = new Map(
    (profiles ?? []).map((p: { id: string; display_name_en: string | null }) => [
      p.id,
      p.display_name_en ?? "Unknown",
    ])
  );

  return data.map((a: AdjustmentRecord) => ({
    ...a,
    adjusted_by_name: nameMap.get(a.adjusted_by) ?? "Unknown",
  }));
}

/**
 * Calculate summary from adjustment records.
 */
export function calculateSummary(
  adjustments: AdjustmentRecord[]
): AdjustmentSummary {
  if (adjustments.length === 0) {
    return {
      original_amount: 0,
      current_amount: 0,
      total_charged: 0,
      total_refunded: 0,
      total_waived: 0,
      total_credited: 0,
      net_balance: 0,
      pending_count: 0,
    };
  }

  const initial = adjustments.find((a) => a.adjustment_type === "initial_payment");
  const latest = adjustments[adjustments.length - 1];

  let total_charged = 0;
  let total_refunded = 0;
  let total_waived = 0;
  let total_credited = 0;
  let pending_count = 0;

  for (const adj of adjustments) {
    const absDiff = Math.abs(adj.difference);
    switch (adj.action_taken) {
      case "charge":
        total_charged += absDiff;
        break;
      case "refund":
        total_refunded += absDiff;
        break;
      case "waive":
        total_waived += absDiff;
        break;
      case "credit":
        total_credited += absDiff;
        break;
      case "pending":
        pending_count++;
        break;
    }
  }

  return {
    original_amount: initial?.new_amount ?? 0,
    current_amount: latest.new_amount,
    total_charged,
    total_refunded,
    total_waived,
    total_credited,
    net_balance: total_charged - total_refunded,
    pending_count,
  };
}

/**
 * Get adjustments + summary in one call.
 */
export async function getAdjustmentsWithSummary(
  admin: SupabaseClient,
  registrationId: string
): Promise<{ adjustments: AdjustmentWithUser[]; summary: AdjustmentSummary }> {
  const adjustments = await getAdjustments(admin, registrationId);
  const summary = calculateSummary(adjustments);
  return { adjustments, summary };
}

/**
 * Insert initial_payment adjustment. Idempotent — skips if already exists.
 */
export async function insertInitialPayment(
  admin: SupabaseClient,
  params: {
    registrationId: string;
    totalAmountCents: number;
    stripePaymentIntentId?: string | null;
    adjustedBy: string;
    source: "payment_confirm" | "admin_registration" | "admin_manual_payment";
  }
): Promise<void> {
  // Idempotency check
  const { data: existing } = await admin
    .from("eckcm_registration_adjustments")
    .select("id")
    .eq("registration_id", params.registrationId)
    .eq("adjustment_type", "initial_payment")
    .maybeSingle();

  if (existing) return;

  await admin.from("eckcm_registration_adjustments").insert({
    registration_id: params.registrationId,
    adjustment_type: "initial_payment",
    previous_amount: 0,
    new_amount: params.totalAmountCents,
    difference: params.totalAmountCents,
    action_taken: "charge",
    stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
    reason: "Initial registration payment",
    adjusted_by: params.adjustedBy,
    metadata: { source: params.source },
  });
}

/**
 * Create a new adjustment and update registration total_amount_cents.
 */
export async function createAdjustment(
  admin: SupabaseClient,
  params: {
    registrationId: string;
    adjustmentType: AdjustmentType;
    newAmount: number;
    actionTaken: AdjustmentAction;
    reason: string;
    adjustedBy: string;
    metadata?: Record<string, unknown>;
    stripePaymentIntentId?: string;
    stripeRefundId?: string;
  }
): Promise<AdjustmentRecord> {
  // 1. Get current registration total
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("total_amount_cents")
    .eq("id", params.registrationId)
    .single();

  if (!reg) throw new Error("Registration not found");

  const previousAmount = reg.total_amount_cents;
  const difference = params.newAmount - previousAmount;

  // 2. Insert adjustment
  const { data: adjustment, error } = await admin
    .from("eckcm_registration_adjustments")
    .insert({
      registration_id: params.registrationId,
      adjustment_type: params.adjustmentType,
      previous_amount: previousAmount,
      new_amount: params.newAmount,
      difference,
      action_taken: params.actionTaken,
      stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
      stripe_refund_id: params.stripeRefundId ?? null,
      reason: params.reason,
      adjusted_by: params.adjustedBy,
      metadata: params.metadata ?? {},
    })
    .select()
    .single();

  if (error || !adjustment) {
    throw new Error(`Failed to create adjustment: ${error?.message}`);
  }

  // 3. Update registration total_amount_cents (optimistic lock: only if amount hasn't changed)
  const { data: updated } = await admin
    .from("eckcm_registrations")
    .update({ total_amount_cents: params.newAmount })
    .eq("id", params.registrationId)
    .eq("total_amount_cents", previousAmount)
    .select("id");

  if (!updated?.length) {
    // Concurrent modification detected — remove the adjustment we just inserted
    await admin
      .from("eckcm_registration_adjustments")
      .delete()
      .eq("id", (adjustment as AdjustmentRecord).id);
    throw new Error("Concurrent modification detected — please retry");
  }

  return adjustment as AdjustmentRecord;
}

/**
 * Process a pending adjustment — update action_taken and Stripe IDs.
 */
export async function processAdjustment(
  admin: SupabaseClient,
  adjustmentId: string,
  params: {
    actionTaken: AdjustmentAction;
    stripePaymentIntentId?: string;
    stripeRefundId?: string;
  }
): Promise<void> {
  await admin
    .from("eckcm_registration_adjustments")
    .update({
      action_taken: params.actionTaken,
      stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
      stripe_refund_id: params.stripeRefundId ?? null,
    })
    .eq("id", adjustmentId);
}
