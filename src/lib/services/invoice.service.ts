import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriceLineItem } from "@/lib/types/registration";

/**
 * Generate invoice number: INV-YYYY-NNNN
 * Uses the same sequence number as the confirmation code for consistency.
 */
export function generateInvoiceNumber(sequence: number, year?: number): string {
  const y = year ?? new Date().getFullYear();
  return `INV-${y}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Extract trailing sequence number from a confirmation code.
 * e.g. "R26KIM0023" → 23
 */
export function extractSeqFromConfirmationCode(code: string): number | null {
  const match = code.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Create an invoice with line items for a registration.
 * Returns the created invoice ID.
 *
 * @param confirmationCode - The registration's confirmation code.
 *   The trailing number is reused as the invoice sequence so that
 *   R26KIM0023 → INV-2026-0023 → RCT-2026-0023.
 */
export async function createInvoice(
  admin: SupabaseClient,
  params: {
    registrationId: string;
    totalCents: number;
    breakdown: PriceLineItem[];
    confirmationCode: string;
  }
): Promise<string> {
  const seq = extractSeqFromConfirmationCode(params.confirmationCode) ?? 1;
  // Derive year from confirmation code: R26... → 2026
  const yyMatch = params.confirmationCode.match(/^R(\d{2})/);
  const year = yyMatch ? 2000 + parseInt(yyMatch[1], 10) : new Date().getFullYear();
  const invoiceNumber = generateInvoiceNumber(seq, year);

  // Create invoice
  const { data: invoice, error: invoiceError } = await admin
    .from("eckcm_invoices")
    .insert({
      registration_id: params.registrationId,
      invoice_number: invoiceNumber,
      total_cents: params.totalCents,
      status: "PENDING",
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    throw new Error(
      `Failed to create invoice: ${invoiceError?.message || "Unknown error"}`
    );
  }

  // Create line items
  if (params.breakdown.length > 0) {
    const lineItems = params.breakdown.map((item, index) => ({
      invoice_id: invoice.id,
      description_en: item.description,
      description_ko: item.descriptionKo,
      quantity: item.quantity,
      unit_price_cents: item.unitPrice,
      total_cents: item.amount,
      sort_order: index,
    }));

    const { error: lineItemError } = await admin
      .from("eckcm_invoice_line_items")
      .insert(lineItems);

    if (lineItemError) {
      throw new Error(
        `Failed to create invoice line items: ${lineItemError.message}`
      );
    }
  }

  return invoice.id;
}

/**
 * Resolve a registration's PRIMARY invoice id = the oldest invoice by issued_at.
 *
 * A registration can now carry SECONDARY "custom charge" invoices (see
 * {@link createCustomChargeInvoice}), each with its own paid MANUAL payment.
 * Any code that needs "the registration's original invoice/payment" — refund
 * targeting, manual payment status/method edits — must resolve it deterministically
 * instead of grabbing an arbitrary or newest invoice, or it could act on a custom
 * charge by mistake. The original registration invoice is always the oldest.
 */
export async function getPrimaryInvoiceId(
  admin: SupabaseClient,
  registrationId: string
): Promise<string | null> {
  const { data } = await admin
    .from("eckcm_invoices")
    .select("id, issued_at")
    .eq("registration_id", registrationId)
    .order("issued_at", { ascending: true })
    .limit(1);
  return data?.[0]?.id ?? null;
}

/**
 * Create a standalone "Custom Charge" invoice for a manual additional amount
 * added by an admin (see the Charge adjustment in the registration detail view).
 *
 * Unlike the primary registration invoice this is a SECONDARY invoice on the same
 * registration. It's created already PAID (status SUCCEEDED + paid_at now) with a
 * recorded MANUAL payment, so both the invoice PDF and the receipt PDF are
 * immediately available in the admin invoices list and the registrant's dashboard.
 *
 * The invoice number reuses the registration's base number with a `-C{n}` suffix
 * (e.g. INV-2026-0023-C1 → receipt RCT-2026-0023-C1) so it reads clearly as a
 * custom charge and never collides with the original registration invoice.
 *
 * @returns the new invoice id and its number.
 */
export async function createCustomChargeInvoice(
  admin: SupabaseClient,
  params: {
    registrationId: string;
    amountCents: number; // gross amount added; must be > 0
    reason: string;
    confirmationCode: string;
    recordedBy: string;
    adjustmentId?: string | null;
  }
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    throw new Error("Custom charge amount must be a positive integer (cents)");
  }

  // Base number from the confirmation code — same scheme as the primary invoice.
  const seq = extractSeqFromConfirmationCode(params.confirmationCode) ?? 1;
  const yyMatch = params.confirmationCode.match(/^R(\d{2})/);
  const year = yyMatch ? 2000 + parseInt(yyMatch[1], 10) : new Date().getFullYear();
  const base = generateInvoiceNumber(seq, year); // INV-2026-0023

  // Next custom-charge index for this registration (INV-...-C1, -C2, ...).
  const { data: existing } = await admin
    .from("eckcm_invoices")
    .select("invoice_number")
    .eq("registration_id", params.registrationId)
    .like("invoice_number", `${base}-C%`);
  const invoiceNumber = `${base}-C${(existing?.length ?? 0) + 1}`;

  const nowIso = new Date().toISOString();

  // 1. Invoice — created already paid so the receipt is available immediately.
  const { data: invoice, error: invoiceError } = await admin
    .from("eckcm_invoices")
    .insert({
      registration_id: params.registrationId,
      invoice_number: invoiceNumber,
      total_cents: params.amountCents,
      status: "SUCCEEDED",
      issued_at: nowIso,
      paid_at: nowIso,
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    throw new Error(
      `Failed to create custom charge invoice: ${invoiceError?.message || "Unknown error"}`
    );
  }

  // 2. Single line item describing the charge.
  const { error: lineItemError } = await admin
    .from("eckcm_invoice_line_items")
    .insert({
      invoice_id: invoice.id,
      description_en: `Custom Charge: ${params.reason}`,
      description_ko: `추가 결제: ${params.reason}`,
      quantity: 1,
      unit_price_cents: params.amountCents,
      total_cents: params.amountCents,
      sort_order: 0,
    });

  if (lineItemError) {
    throw new Error(
      `Failed to create custom charge line item: ${lineItemError.message}`
    );
  }

  // 3. Recorded MANUAL payment (no Stripe) marking the charge as collected.
  const { error: paymentError } = await admin.from("eckcm_payments").insert({
    invoice_id: invoice.id,
    payment_method: "MANUAL",
    amount_cents: params.amountCents,
    status: "SUCCEEDED",
    metadata: {
      source: "custom_charge",
      adjustment_id: params.adjustmentId ?? null,
      recorded_by: params.recordedBy,
    },
  });

  if (paymentError) {
    throw new Error(
      `Failed to create custom charge payment: ${paymentError.message}`
    );
  }

  return { invoiceId: invoice.id, invoiceNumber };
}
