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
