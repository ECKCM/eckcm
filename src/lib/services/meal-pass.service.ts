import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEPassToken } from "@/lib/services/epass.service";
import { getPaymentLinkOrigin } from "@/lib/payment/payment-link";

/** Tier codes a standalone meal buyer may pick (subset of MEAL_* fee categories). */
export type MealPassTier = "MEAL_GENERAL" | "MEAL_YOUTH";

/** Public redemption URL the QR encodes: {origin}/m/{token}. */
export function buildMealPassUrl(token: string): string {
  return `${getPaymentLinkOrigin()}/m/${token}`;
}

/**
 * Resolve the per-meal price (in cents) for a tier from the active default
 * registration group's MEAL_* fee categories. The standalone meal buyer has no
 * registration group, so we read pricing from the default group — the same
 * source the registration estimate uses (eckcm_registration_group_fee_categories
 * → eckcm_fee_categories, PER_MEAL). Returns null when no matching priced
 * category exists (pricing not configured), so callers can reject cleanly.
 *
 * NEVER trust a client-supplied price — always resolve here, server-side.
 */
export async function getMealUnitPriceCents(
  admin: SupabaseClient,
  tierCode: MealPassTier
): Promise<number | null> {
  const { data: defaultGroup } = await admin
    .from("eckcm_registration_groups")
    .select("id")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  if (!defaultGroup) return null;

  const { data: feeLinks } = await admin
    .from("eckcm_registration_group_fee_categories")
    .select("eckcm_fee_categories!inner(code, pricing_type, amount_cents)")
    .eq("registration_group_id", defaultGroup.id);

  const cat = (feeLinks ?? [])
    .map((row: { eckcm_fee_categories: unknown }) => row.eckcm_fee_categories as {
      code: string;
      pricing_type: string;
      amount_cents: number;
    })
    .find((f) => f.code === tierCode && f.pricing_type === "PER_MEAL");

  if (!cat) return null;
  return cat.amount_cents;
}

/** Stripe processing-fee gross-up (2.9% + $0.30), same formula as custom payments. */
export function applyFeeCoverage(amountCents: number, coversFees: boolean): {
  chargeAmount: number;
  feeCents: number;
} {
  const chargeAmount = coversFees
    ? Math.ceil((amountCents + 30) / (1 - 0.029))
    : amountCents;
  return { chargeAmount, feeCents: coversFees ? chargeAmount - amountCents : 0 };
}

/** Fresh unique token + its hash for a new meal pass. */
export function newMealPassToken(): { token: string; tokenHash: string } {
  return generateEPassToken();
}
