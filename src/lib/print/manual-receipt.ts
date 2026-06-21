// Shared types + helpers for the admin Print → Manual Receipts feature.
//
// A manual receipt is a printable document an admin builds by hand or imports
// from a registration snapshot. It is intentionally decoupled from the billing
// flow (eckcm_invoices / eckcm_payments): nothing here touches Stripe, refunds,
// or settlement. See migration 20260620140000_add-manual-receipts.sql.

import type { SupabaseClient } from "@supabase/supabase-js";

/** One editable line on a receipt. Cents are integer USD cents. */
export interface ReceiptLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
}

/** A manual receipt as stored / round-tripped through the API. */
export interface ManualReceipt {
  id: string;
  receiptNumber: string;
  receiptSeq: number;
  eventId: string | null;
  registrationId: string | null;
  recipientName: string;
  recipientDetail: string | null;
  receiptDate: string; // YYYY-MM-DD
  lineItems: ReceiptLineItem[];
  amountCents: number;
  paymentMethod: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The editable subset a create/update request sends. */
export interface ManualReceiptInput {
  eventId?: string | null;
  registrationId?: string | null;
  receiptNumber?: string;
  recipientName: string;
  recipientDetail?: string | null;
  receiptDate?: string; // YYYY-MM-DD
  lineItems: ReceiptLineItem[];
  amountCents?: number; // when omitted, derived from line items
  paymentMethod?: string | null;
  memo?: string | null;
}

/** Format a receipt number: MR-YYYY-NNNN. */
export function formatReceiptNumber(seq: number, year: number): string {
  return `MR-${year}-${String(seq).padStart(4, "0")}`;
}

/** Sum of line-item amounts, in cents. */
export function sumLineItems(items: ReceiptLineItem[]): number {
  return items.reduce((acc, li) => acc + (Number(li.amountCents) || 0), 0);
}

/**
 * Coerce an untrusted line-items payload into a clean ReceiptLineItem[].
 * Drops nothing — keeps every row but normalizes types so the stored JSON and
 * the printed totals are always numeric. quantity defaults to 1.
 */
export function normalizeLineItems(raw: unknown): ReceiptLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    const quantity = Number(row.quantity);
    const unitPriceCents = Math.round(Number(row.unitPriceCents) || 0);
    // amountCents is authoritative if provided; otherwise qty × unit price.
    const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const amountCents =
      row.amountCents !== undefined && row.amountCents !== null
        ? Math.round(Number(row.amountCents) || 0)
        : qty * unitPriceCents;
    return {
      description: String(row.description ?? ""),
      quantity: qty,
      unitPriceCents,
      amountCents,
    };
  });
}

/** Map a DB row (snake_case) to the camelCase ManualReceipt API shape. */
export function rowToManualReceipt(row: Record<string, unknown>): ManualReceipt {
  return {
    id: String(row.id),
    receiptNumber: String(row.receipt_number ?? ""),
    receiptSeq: Number(row.receipt_seq ?? 0),
    eventId: (row.event_id as string | null) ?? null,
    registrationId: (row.registration_id as string | null) ?? null,
    recipientName: String(row.recipient_name ?? ""),
    recipientDetail: (row.recipient_detail as string | null) ?? null,
    receiptDate: String(row.receipt_date ?? ""),
    lineItems: normalizeLineItems(row.line_items),
    amountCents: Number(row.amount_cents ?? 0),
    paymentMethod: (row.payment_method as string | null) ?? null,
    memo: (row.memo as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

/**
 * Reserve the next receipt sequence + formatted number for `year`.
 *
 * Sequence is per-year: the highest receipt_seq among rows whose number starts
 * with `MR-<year>-`, plus one. Numbers may legitimately repeat across years
 * (MR-2026-0001, MR-2027-0001) which is why the UNIQUE constraint is on the
 * full string, not the seq. A 23505 on insert (two admins racing) is the
 * caller's signal to retry with a bumped seq.
 */
export async function nextReceiptNumber(
  admin: SupabaseClient,
  year: number
): Promise<{ seq: number; receiptNumber: string }> {
  const { data } = await admin
    .from("eckcm_manual_receipts")
    .select("receipt_seq")
    .like("receipt_number", `MR-${year}-%`)
    .order("receipt_seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  const seq = (data?.receipt_seq ?? 0) + 1;
  return { seq, receiptNumber: formatReceiptNumber(seq, year) };
}
