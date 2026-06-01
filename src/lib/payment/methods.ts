import type { PaymentMethod } from "@/lib/types/database";

/**
 * Manual (non-card) payment methods.
 *
 * These all bypass card processing fees, so they receive the
 * MANUAL_PAYMENT_DISCOUNT and can have their payment status changed
 * manually by an admin. Keep this list as the single source of truth —
 * adding a new manual method (or forgetting one, like ONSITE) anywhere
 * else leads to inconsistent admin behavior.
 *
 * Note: ONSITE only qualifies for the discount when the on-site payment
 * is made by Zelle, check, or cash — paying by card on-site does not.
 */
export const MANUAL_PAYMENT_METHODS: readonly PaymentMethod[] = [
  "MANUAL",
  "CHECK",
  "ZELLE",
  "ONSITE",
  "ONSITE_CASH",
  "ONSITE_CHECK",
  "ONSITE_ZELLE",
] as const;

/** Human-readable list for error/validation messages. */
export const MANUAL_PAYMENT_METHODS_LABEL =
  "Manual, Check, Zelle, On-Site (Cash/Check/Zelle)";

/**
 * Admin-editable payment methods for the registration detail view.
 *
 * CARD (and the wallet variants APPLE_PAY / GOOGLE_PAY) is intentionally
 * excluded: card payments are settled through Stripe and must not be set
 * manually. Switching *to* card only ever happens automatically when a real
 * card charge succeeds.
 */
export const EDITABLE_PAYMENT_METHODS: readonly {
  value: PaymentMethod;
  label: string;
}[] = [
  { value: "ZELLE", label: "Zelle" },
  { value: "CHECK", label: "Check" },
  { value: "MANUAL", label: "Manual" },
  { value: "ONSITE", label: "On-Site" },
  { value: "ONSITE_CASH", label: "On-Site (Cash)" },
  { value: "ONSITE_CHECK", label: "On-Site (Check)" },
  { value: "ONSITE_ZELLE", label: "On-Site (Zelle)" },
] as const;

/** Returns true if the given payment method is a manual (non-card) method. */
export function isManualPaymentMethod(method: string | null | undefined): boolean {
  if (!method) return false;
  return (MANUAL_PAYMENT_METHODS as readonly string[]).includes(method.toUpperCase());
}
