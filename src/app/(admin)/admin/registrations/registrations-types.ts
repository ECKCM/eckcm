import { formatCurrency } from "@/lib/utils/formatters";

export interface Event {
  id: string;
  name_en: string;
  year: number;
  stripe_mode: string | null;
}

export interface RegistrationRow {
  id: string;
  confirmation_code: string;
  status: string;
  registration_type: string;
  start_date: string;
  end_date: string;
  nights_count: number;
  total_amount_cents: number;
  notes: string | null;
  additional_requests: string | null;
  created_at: string;
  updated_at: string;
  group_count: number;
  people_count: number;
  registrant_name: string;
  registrant_name_ko: string | null;
  registrant_email: string | null;
  registrant_phone: string | null;
  registrant_church: string | null;
  registrant_department: string | null;
  registrant_guardian_name: string | null;
  registrant_guardian_phone: string | null;
  registration_group_id: string | null;
  registration_group_name: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  payment_status: string | null;
  payment_method: string | null;
  stripe_payment_intent_id: string | null;
  payment_amount_cents: number;
  paid_at: string | null;
  checked_in: boolean;
  checked_out: boolean;
  room_numbers: string[];
  lodging_type: string | null;
  preferences: { elderly: boolean; handicapped: boolean; firstFloor: boolean } | null;
  is_highlighted: boolean;
  seq_number: number | null;
}

export interface PersonDetail {
  person_id: string;
  membership_id: string;
  group_id: string;
  first_name_en: string;
  last_name_en: string;
  display_name_ko: string | null;
  gender: string;
  birth_date: string | null;
  age_at_event: number | null;
  is_k12: boolean;
  grade: string | null;
  email: string | null;
  phone: string | null;
  phone_country: string | null;
  church_id: string | null;
  church_name: string | null;
  church_other: string | null;
  department_id: string | null;
  department_name: string | null;
  church_role: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  group_code: string;
  role: string;
  participant_code: string | null;
  stay_start_date: string | null;
  stay_end_date: string | null;
  meal_selections: { meal_date: string; meal_type: string; is_selected: boolean }[];
}

/** A participant transferred AWAY from this registration (tracking record). */
export interface TransferOutRecord {
  id: string;
  person_id: string;
  first_name_en: string | null;
  last_name_en: string | null;
  display_name_ko: string | null;
  original_role: string;
  original_participant_code: string | null;
  new_participant_code: string | null;
  to_registration_id: string;
  to_confirmation_code: string | null;
  transferred_at: string;
}

/** A participant cloned INTO this registration from another one. */
export interface TransferInRecord {
  id: string;
  person_id: string;
  to_membership_id: string | null;
  original_participant_code: string | null;
  from_confirmation_code: string | null;
  transferred_at: string;
}

export const STATUS_OPTIONS = ["ALL", "PAID", "APPROVED", "SUBMITTED", "DRAFT", "CANCELLED", "REFUNDED"];
export const VALID_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "PAID", "CANCELLED", "REFUNDED"];

export const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PAID: "default",
  APPROVED: "default",
  SUBMITTED: "outline",
  DRAFT: "secondary",
  CANCELLED: "destructive",
  REFUNDED: "destructive",
};

export const paymentStatusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  SUCCEEDED: "default",
  PENDING: "outline",
  FAILED: "destructive",
  REFUNDED: "destructive",
  PARTIALLY_REFUNDED: "destructive",
};

export function formatMoney(cents: number) {
  return formatCurrency(cents);
}

export function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Calculate non-refundable processing fee based on payment method.
 * - Card / Apple Pay / Google Pay / Amazon: 2.9% + 30¢
 * - Zelle / Check (Manual): $0
 */
export function calculateProcessingFee(amountCents: number, paymentMethod: string | null): number {
  if (!paymentMethod) return 0;
  const method = paymentMethod.toUpperCase();

  if (["ZELLE", "CHECK", "MANUAL", "MANUAL_PAYMENT"].includes(method)) {
    return 0;
  }

  // Card, Apple Pay, Google Pay, Amazon Pay, etc.
  return Math.round(amountCents * 0.029) + 30;
}

/**
 * Minimum allowed refund amount (Stripe refund / customer-received), in cents.
 * Refunds below this are rejected — Stripe enforces ~$0.50 anyway and
 * micro-refunds aren't worth the ledger noise.
 */
export const MIN_REFUND_CENTS = 100;

/**
 * Calculate the proportional, non-refundable processing fee for a *partial*
 * refund. Stripe doesn't return the original processing fee on refunds, so
 * the church should withhold the share of the fee that belongs to the
 * refunded portion — otherwise the church eats the fee on every partial.
 *
 *   percent_part = refund * 2.9%
 *   fixed_part   = (refund / original_payment) * $0.30    (prorated)
 *
 * For Zelle/Check/Manual payments this returns 0.
 */
export function calculateProportionalProcessingFee(
  refundCents: number,
  paymentAmountCents: number,
  paymentMethod: string | null,
): number {
  if (!paymentMethod) return 0;
  const method = paymentMethod.toUpperCase();
  if (["ZELLE", "CHECK", "MANUAL", "MANUAL_PAYMENT"].includes(method)) {
    return 0;
  }
  if (refundCents <= 0 || paymentAmountCents <= 0) return 0;

  const percentFee = Math.round(refundCents * 0.029);
  const fixedFee = Math.round((Math.min(refundCents, paymentAmountCents) / paymentAmountCents) * 30);
  return percentFee + fixedFee;
}

export function extractSeqNumber(code: string | null): string {
  if (!code || code.length < 4) return "-";
  return code.slice(-4);
}

export function parseSeqNumber(code: string | null): number | null {
  if (!code) return null;
  const match = code.match(/(\d+)\s*$/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return isNaN(n) ? null : n;
}
