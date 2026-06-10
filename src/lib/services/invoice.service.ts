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
 * A registration can carry SECONDARY "custom charge" invoices (see
 * {@link applyChargeToRegistration}). Any code that needs "the registration's
 * original invoice/payment" — refund targeting — must resolve it deterministically
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
 * Resolve a registration's OUTSTANDING (unpaid) invoice = the oldest invoice whose
 * status is not a terminal paid/refunded state.
 *
 * A registration is kept to at most ONE outstanding invoice at a time (see
 * {@link applyChargeToRegistration}), so this is the single invoice that the
 * settlement layer (card payment link, manual payment-status change) and the admin
 * display should act on whenever the registration owes money.
 */
export async function getOutstandingInvoice(
  admin: SupabaseClient,
  registrationId: string
): Promise<{ id: string; total_cents: number } | null> {
  const { data } = await admin
    .from("eckcm_invoices")
    .select("id, total_cents, status, issued_at")
    .eq("registration_id", registrationId)
    .not("status", "in", "(SUCCEEDED,REFUNDED,PARTIALLY_REFUNDED)")
    .order("issued_at", { ascending: true })
    .limit(1);
  const inv = data?.[0];
  return inv ? { id: inv.id, total_cents: inv.total_cents } : null;
}

/**
 * Build the English line-item description for a custom charge.
 *
 * The invoice PDF renders `description_en` with Helvetica (WinAnsi), which cannot
 * display Hangul. So the reason is inlined ONLY when it's Latin-renderable;
 * otherwise the PDF shows a clean "Custom Charge" label and the full reason is
 * preserved in `description_ko` and the adjustment ledger.
 */
export function buildCustomChargeDescriptionEn(reason: string): string {
  const r = reason.trim();
  const isLatin = /^[\x20-\x7E\xA0-\xFF]*$/.test(r);
  return isLatin && r ? `Custom Charge: ${r}` : "Custom Charge";
}

/** Korean line-item description for a custom charge (kept verbatim). */
export function buildCustomChargeDescriptionKo(reason: string): string {
  const r = reason.trim();
  return r ? `추가 결제: ${r}` : "추가 결제";
}

/**
 * Build the English line-item description for an adjustment that REDUCES the
 * total (discount or other downward correction). Same WinAnsi/Hangul constraint
 * as {@link buildCustomChargeDescriptionEn}.
 */
export function buildReductionDescriptionEn(
  reason: string,
  adjustmentType?: string
): string {
  const label = adjustmentType === "discount" ? "Discount" : "Price Adjustment";
  const r = reason.trim();
  const isLatin = /^[\x20-\x7E\xA0-\xFF]*$/.test(r);
  return isLatin && r ? `${label}: ${r}` : label;
}

/** Korean line-item description for a reduction (reason kept verbatim). */
export function buildReductionDescriptionKo(
  reason: string,
  adjustmentType?: string
): string {
  const label = adjustmentType === "discount" ? "할인" : "금액 조정";
  const r = reason.trim();
  return r ? `${label}: ${r}` : label;
}

/**
 * Update a custom-charge line item to reflect an edited reason, keeping the
 * invoice/receipt documents in sync. Targets the exact line item when its id is
 * known; otherwise falls back to a single-line-item invoice (a dedicated `-C`
 * invoice) and skips folded invoices where the item can't be identified safely.
 */
export async function updateCustomChargeLineItem(
  admin: SupabaseClient,
  target: { lineItemId?: string | null; invoiceId?: string | null },
  reason: string
): Promise<void> {
  const patch = {
    description_en: buildCustomChargeDescriptionEn(reason),
    description_ko: buildCustomChargeDescriptionKo(reason),
  };
  await patchLineItemDescriptions(admin, target, patch);
}

/**
 * Update a reduction (discount) line item to reflect an edited reason/type,
 * keeping the invoice/receipt documents in sync. Same targeting rules as
 * {@link updateCustomChargeLineItem}.
 */
export async function updateReductionLineItem(
  admin: SupabaseClient,
  target: { lineItemId?: string | null; invoiceId?: string | null },
  reason: string,
  adjustmentType?: string
): Promise<void> {
  const patch = {
    description_en: buildReductionDescriptionEn(reason, adjustmentType),
    description_ko: buildReductionDescriptionKo(reason, adjustmentType),
  };
  await patchLineItemDescriptions(admin, target, patch);
}

async function patchLineItemDescriptions(
  admin: SupabaseClient,
  target: { lineItemId?: string | null; invoiceId?: string | null },
  patch: { description_en: string; description_ko: string }
): Promise<void> {
  if (target.lineItemId) {
    await admin
      .from("eckcm_invoice_line_items")
      .update(patch)
      .eq("id", target.lineItemId);
    return;
  }
  if (target.invoiceId) {
    const { data: items } = await admin
      .from("eckcm_invoice_line_items")
      .select("id")
      .eq("invoice_id", target.invoiceId);
    if (items && items.length === 1) {
      await admin
        .from("eckcm_invoice_line_items")
        .update(patch)
        .eq("id", items[0].id);
    }
  }
}

/**
 * Apply an admin "Custom Charge" (an additional amount the registrant owes) to a
 * registration as a PENDING amount — NOT auto-paid. The registrant settles it later
 * via the self-service card payment link or a manual payment-status change, at which
 * point the invoice becomes SUCCEEDED and the receipt becomes available.
 *
 * Keeps the registration to at most ONE outstanding invoice so the existing
 * single-invoice settlement layer keeps working unchanged:
 *   - if an outstanding (unpaid) invoice exists, the charge is FOLDED into it
 *     (extra line item + higher invoice total + higher pending payment);
 *   - otherwise (the registration is fully paid) a new PENDING `-C{n}` invoice is
 *     CREATED for the delta, with its own pending payment so the manual changer can
 *     settle it. The original paid invoice is never touched (no double charge).
 *
 * The new amount is reflected on the registration total separately, by the caller's
 * `createAdjustment` (optimistic-lock bump) — this function only manages invoices.
 *
 * @returns the affected invoice id/number and whether it was folded into an existing one.
 */
export async function applyChargeToRegistration(
  admin: SupabaseClient,
  params: {
    registrationId: string;
    amountCents: number; // gross amount added; must be > 0
    reason: string;
    confirmationCode: string;
    paymentMethod?: string | null; // method for the pending payment row (fallback MANUAL)
    recordedBy: string;
    adjustmentId?: string | null;
  }
): Promise<{ invoiceId: string; invoiceNumber: string; folded: boolean; lineItemId: string | null }> {
  if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    throw new Error("Custom charge amount must be a positive integer (cents)");
  }

  const method = (params.paymentMethod ?? "MANUAL").toUpperCase();
  const descEn = buildCustomChargeDescriptionEn(params.reason);
  const descKo = buildCustomChargeDescriptionKo(params.reason);
  const paymentMeta = {
    source: "custom_charge",
    adjustment_id: params.adjustmentId ?? null,
    recorded_by: params.recordedBy,
  };

  const outstanding = await getOutstandingInvoice(admin, params.registrationId);

  if (outstanding) {
    // ── Fold into the existing unpaid invoice (keeps it the single outstanding one) ──
    const { data: lastItem } = await admin
      .from("eckcm_invoice_line_items")
      .select("sort_order")
      .eq("invoice_id", outstanding.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSort = ((lastItem?.sort_order as number | null) ?? -1) + 1;

    const { data: foldedLine, error: lineErr } = await admin
      .from("eckcm_invoice_line_items")
      .insert({
        invoice_id: outstanding.id,
        description_en: descEn,
        description_ko: descKo,
        quantity: 1,
        unit_price_cents: params.amountCents,
        total_cents: params.amountCents,
        sort_order: nextSort,
      })
      .select("id")
      .single();
    if (lineErr) {
      throw new Error(`Failed to add custom charge line item: ${lineErr.message}`);
    }

    await admin
      .from("eckcm_invoices")
      .update({ total_cents: outstanding.total_cents + params.amountCents })
      .eq("id", outstanding.id);

    // Keep the pending payment in step with the new total so the manual changer /
    // card link settle the right amount. Bump an existing pending row, else add one.
    const { data: pending } = await admin
      .from("eckcm_payments")
      .select("id, amount_cents")
      .eq("invoice_id", outstanding.id)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pending) {
      await admin
        .from("eckcm_payments")
        .update({ amount_cents: (pending.amount_cents ?? 0) + params.amountCents })
        .eq("id", pending.id);
    } else {
      await admin.from("eckcm_payments").insert({
        invoice_id: outstanding.id,
        payment_method: method,
        amount_cents: outstanding.total_cents + params.amountCents,
        status: "PENDING",
        metadata: paymentMeta,
      });
    }

    const { data: inv } = await admin
      .from("eckcm_invoices")
      .select("invoice_number")
      .eq("id", outstanding.id)
      .maybeSingle();

    return {
      invoiceId: outstanding.id,
      invoiceNumber: (inv?.invoice_number as string) ?? "",
      folded: true,
      lineItemId: (foldedLine?.id as string) ?? null,
    };
  }

  // ── No outstanding invoice (registration fully paid): create a PENDING delta ──
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

  // issued_at = now (never the oldest) so refund targeting still resolves the original.
  const { data: invoice, error: invoiceError } = await admin
    .from("eckcm_invoices")
    .insert({
      registration_id: params.registrationId,
      invoice_number: invoiceNumber,
      total_cents: params.amountCents,
      status: "PENDING",
      issued_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    throw new Error(
      `Failed to create custom charge invoice: ${invoiceError?.message || "Unknown error"}`
    );
  }

  const { data: newLine, error: lineItemError } = await admin
    .from("eckcm_invoice_line_items")
    .insert({
      invoice_id: invoice.id,
      description_en: descEn,
      description_ko: descKo,
      quantity: 1,
      unit_price_cents: params.amountCents,
      total_cents: params.amountCents,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (lineItemError) {
    throw new Error(`Failed to create custom charge line item: ${lineItemError.message}`);
  }

  // Pending payment (no Stripe) so the manual changer can settle it; the card link
  // supersedes this with a real card PaymentIntent when paid online.
  const { error: paymentError } = await admin.from("eckcm_payments").insert({
    invoice_id: invoice.id,
    payment_method: method,
    amount_cents: params.amountCents,
    status: "PENDING",
    metadata: paymentMeta,
  });
  if (paymentError) {
    throw new Error(`Failed to create custom charge payment: ${paymentError.message}`);
  }

  return {
    invoiceId: invoice.id,
    invoiceNumber,
    folded: false,
    lineItemId: (newLine?.id as string) ?? null,
  };
}

/**
 * Apply an adjustment that LOWERS the registration total (discount / downward
 * correction) to the registration's OUTSTANDING (unpaid) invoice, so what will
 * actually be collected matches the adjusted total:
 *   - a negative line item documenting the reduction;
 *   - lower invoice total_cents;
 *   - lower (latest) PENDING payment row.
 *
 * Without this, the settle flows keep collecting the OLD amount: the manual
 * payment changer bills invoice.total_cents, and the card link RECOMPUTES the
 * invoice total from its line items (overwriting registration total_amount_cents
 * too) — silently erasing the adjustment.
 *
 * The line item's sort_order is forced >= 1000: sort_order 999 is reserved for
 * the manual-payment discount, which the card-link flow deletes before paying
 * by card. An admin reduction must survive that strip.
 *
 * The reduction folds only up to the outstanding invoice's total (an invoice
 * never goes negative); the adjustment ledger still records the full intent.
 * Returns null (no-op) when there is no outstanding invoice — e.g. the
 * registration is fully paid, where money moves back via the refund action.
 */
export async function applyReductionToRegistration(
  admin: SupabaseClient,
  params: {
    registrationId: string;
    amountCents: number; // gross reduction; must be > 0
    reason: string;
    adjustmentType?: string;
  }
): Promise<{
  invoiceId: string;
  invoiceNumber: string;
  lineItemId: string | null;
  appliedCents: number;
} | null> {
  if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    throw new Error("Reduction amount must be a positive integer (cents)");
  }

  const outstanding = await getOutstandingInvoice(admin, params.registrationId);
  if (!outstanding) return null;

  const applied = Math.min(
    params.amountCents,
    Math.max(0, outstanding.total_cents)
  );
  if (applied <= 0) return null;

  const { data: lastItem } = await admin
    .from("eckcm_invoice_line_items")
    .select("sort_order")
    .eq("invoice_id", outstanding.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = Math.max(
    ((lastItem?.sort_order as number | null) ?? -1) + 1,
    1000
  );

  const { data: line, error: lineErr } = await admin
    .from("eckcm_invoice_line_items")
    .insert({
      invoice_id: outstanding.id,
      description_en: buildReductionDescriptionEn(
        params.reason,
        params.adjustmentType
      ),
      description_ko: buildReductionDescriptionKo(
        params.reason,
        params.adjustmentType
      ),
      quantity: 1,
      unit_price_cents: -applied,
      total_cents: -applied,
      sort_order: nextSort,
    })
    .select("id")
    .single();
  if (lineErr) {
    throw new Error(`Failed to add reduction line item: ${lineErr.message}`);
  }

  await admin
    .from("eckcm_invoices")
    .update({ total_cents: outstanding.total_cents - applied })
    .eq("id", outstanding.id);

  // Keep the pending payment in step so the manual changer / card link settle
  // the reduced amount.
  const { data: pending } = await admin
    .from("eckcm_payments")
    .select("id, amount_cents")
    .eq("invoice_id", outstanding.id)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pending) {
    await admin
      .from("eckcm_payments")
      .update({
        amount_cents: Math.max(0, (pending.amount_cents ?? 0) - applied),
      })
      .eq("id", pending.id);
  }

  const { data: inv } = await admin
    .from("eckcm_invoices")
    .select("invoice_number")
    .eq("id", outstanding.id)
    .maybeSingle();

  return {
    invoiceId: outstanding.id,
    invoiceNumber: (inv?.invoice_number as string) ?? "",
    lineItemId: (line?.id as string) ?? null,
    appliedCents: applied,
  };
}
