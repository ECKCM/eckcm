import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPaymentMethod } from "@/lib/payment/methods";
import type { ReceiptLineItem } from "@/lib/print/manual-receipt";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/admin/print/receipts/from-registration?code=R26KIM0023
 *   (or ?registrationId=<uuid>)
 *
 * Returns a NON-PERSISTED snapshot of a registration shaped for the manual
 * receipt editor: recipient, line items copied from the registration's first
 * invoice, total, payment method, and the event id. The admin edits this in the
 * form and saves it as its own manual receipt (POST /receipts) — the source
 * registration and its invoice are never mutated.
 */
export async function GET(req: NextRequest) {
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = req.nextUrl.searchParams.get("code")?.trim();
  const registrationId = req.nextUrl.searchParams.get("registrationId")?.trim();
  if (!code && !registrationId) {
    return NextResponse.json(
      { error: "code or registrationId is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // ── Registration + event + invoice line items ──
  let regQuery = admin
    .from("eckcm_registrations")
    .select(
      `
      id,
      confirmation_code,
      total_amount_cents,
      event_id,
      eckcm_events(name_en, year),
      eckcm_invoices(
        issued_at,
        total_cents,
        eckcm_invoice_line_items(description_en, quantity, unit_price_cents, total_cents, sort_order),
        eckcm_payments(payment_method, status)
      )
    `
    )
    .limit(1);

  regQuery = registrationId
    ? regQuery.eq("id", registrationId)
    : regQuery.ilike("confirmation_code", code!);

  const { data: reg, error } = await regQuery.maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!reg) {
    return NextResponse.json(
      { error: "Registration not found" },
      { status: 404 }
    );
  }

  // First (most recent) invoice → its line items become the receipt rows.
  const invoices = ((reg as any).eckcm_invoices ?? []) as any[];
  invoices.sort((a, b) =>
    String(b.issued_at ?? "").localeCompare(String(a.issued_at ?? ""))
  );
  const invoice = invoices[0] ?? null;

  const rawLineItems = (invoice?.eckcm_invoice_line_items ?? []) as any[];
  rawLineItems.sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const lineItems: ReceiptLineItem[] = rawLineItems.map((li) => ({
    description: li.description_en ?? "",
    quantity: li.quantity ?? 1,
    unitPriceCents: li.unit_price_cents ?? 0,
    amountCents: li.total_cents ?? 0,
  }));

  // Recipient: the registration representative (first/most-relevant person).
  const { data: rep } = await admin
    .from("eckcm_group_memberships")
    .select(
      `role,
       eckcm_people!inner(first_name_en, last_name_en, display_name_ko, email, church_other, eckcm_churches(name_en)),
       eckcm_groups!inner(registration_id)`
    )
    .eq("eckcm_groups.registration_id", (reg as any).id)
    .eq("role", "REPRESENTATIVE")
    .limit(1)
    .maybeSingle();

  const person = (rep as any)?.eckcm_people ?? null;
  const recipientName = person
    ? `${person.first_name_en ?? ""} ${person.last_name_en ?? ""}`.trim() ||
      person.display_name_ko ||
      ""
    : "";
  const church = person?.church_other || person?.eckcm_churches?.name_en || null;

  // Payment method: prefer a succeeded payment, else first recorded.
  const payments = (invoice?.eckcm_payments ?? []) as any[];
  const chosenPayment =
    payments.find((p) => p.status === "SUCCEEDED") ?? payments[0] ?? null;
  const paymentMethod = chosenPayment
    ? formatPaymentMethod(chosenPayment.payment_method)
    : null;

  const event = (reg as any).eckcm_events ?? {};
  const amountCents =
    invoice?.total_cents ?? (reg as any).total_amount_cents ?? 0;

  return NextResponse.json({
    snapshot: {
      eventId: (reg as any).event_id ?? null,
      registrationId: (reg as any).id,
      confirmationCode: (reg as any).confirmation_code ?? null,
      eventName: event.name_en ?? null,
      recipientName,
      recipientDetail: church,
      lineItems,
      amountCents,
      paymentMethod,
    },
  });
}
