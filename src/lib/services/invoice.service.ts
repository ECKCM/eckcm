import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriceLineItem } from "@/lib/types/registration";

/**
 * Generate invoice number: INV-YYYY-NNNN
 */
export function generateInvoiceNumber(sequence: number): string {
  const year = new Date().getFullYear();
  return `INV-${year}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Create an invoice with line items for a registration.
 * Returns the created invoice ID.
 */
export async function createInvoice(
  admin: SupabaseClient,
  params: {
    registrationId: string;
    totalCents: number;
    breakdown: PriceLineItem[];
  }
): Promise<string> {
  // Get next sequence number
  const { count } = await admin
    .from("ECKCM_invoices")
    .select("id", { count: "exact", head: true });

  const invoiceNumber = generateInvoiceNumber((count ?? 0) + 1);

  // Create invoice
  const { data: invoice, error: invoiceError } = await admin
    .from("ECKCM_invoices")
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
      .from("ECKCM_invoice_line_items")
      .insert(lineItems);

    if (lineItemError) {
      throw new Error(
        `Failed to create invoice line items: ${lineItemError.message}`
      );
    }
  }

  return invoice.id;
}
