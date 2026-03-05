import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInvoicePdf } from "@/lib/pdf/generate";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: invoiceId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Load invoice with all needed data
  const { data: invoice } = await admin
    .from("eckcm_invoices")
    .select(`
      id,
      invoice_number,
      total_cents,
      status,
      issued_at,
      paid_at,
      registration_id,
      eckcm_invoice_line_items(description_en, quantity, unit_price_cents, total_cents),
      eckcm_payments(payment_method, status)
    `)
    .eq("id", invoiceId)
    .single();

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inv = invoice as any;

  // Verify ownership
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("created_by_user_id, confirmation_code, eckcm_events!inner(name_en), eckcm_users!inner(role)")
    .eq("id", inv.registration_id)
    .single();

  if (!reg) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = reg as any;
  const isAdmin = r.eckcm_users?.role === "ADMIN" || r.eckcm_users?.role === "SUPER_ADMIN";
  if (r.created_by_user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isPaid = inv.status === "SUCCEEDED";
  const payment = (inv.eckcm_payments ?? []).find(
    (p: { status: string }) => p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED"
  );

  const lineItems = (inv.eckcm_invoice_line_items ?? []).map(
    (li: { description_en: string; quantity: number; unit_price_cents: number; total_cents: number }) => ({
      description: li.description_en,
      quantity: li.quantity,
      unitPrice: `$${(li.unit_price_cents / 100).toFixed(2)}`,
      amount: `$${(li.total_cents / 100).toFixed(2)}`,
    })
  );

  const pdfBuffer = await generateInvoicePdf({
    invoiceNumber: inv.invoice_number,
    confirmationCode: r.confirmation_code ?? "",
    eventName: r.eckcm_events?.name_en ?? "ECKCM Event",
    issuedDate: new Date(inv.issued_at).toLocaleDateString("en-US"),
    isPaid,
    paymentMethod: payment?.payment_method ?? "-",
    paymentDate: inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("en-US") : "-",
    lineItems,
    subtotal: `$${(inv.total_cents / 100).toFixed(2)}`,
    total: `$${(inv.total_cents / 100).toFixed(2)}`,
  });

  const docType = isPaid ? "receipt" : "invoice";
  const filename = `eckcm-${docType}-${inv.invoice_number}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.length),
    },
  });
}
