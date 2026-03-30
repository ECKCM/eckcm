import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { generateInvoicePdf } from "@/lib/pdf/generate";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: invoiceId } = await params;

  // ?type=invoice → always render as Invoice (PENDING PAYMENT)
  // ?type=receipt → always render as Receipt (PAID) — only if invoice is actually paid
  // no param    → auto-detect based on invoice status (legacy behavior)
  const typeParam = req.nextUrl.searchParams.get("type") as "invoice" | "receipt" | null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminAuth = await requireAdmin();
  const currentUserIsAdmin = !!adminAuth;

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

  // Verify ownership and load registration + event data
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("created_by_user_id, confirmation_code, eckcm_events!inner(name_en, event_end_date)")
    .eq("id", inv.registration_id)
    .single();

  if (!reg) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = reg as any;
  if (r.created_by_user_id !== user.id && !currentUserIsAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get registrant email for "Bill To" + participant names
  const [{ data: { user: registrant } }, { data: memberships }] = await Promise.all([
    admin.auth.admin.getUserById(r.created_by_user_id),
    admin
      .from("eckcm_group_memberships")
      .select("eckcm_people!inner(first_name_en, last_name_en, display_name_ko), eckcm_groups!inner(registration_id)")
      .eq("eckcm_groups.registration_id", inv.registration_id),
  ]);
  const billTo = registrant?.email ?? user.email ?? "-";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const participants = (memberships ?? []).map((m: any) => {
    const p = m.eckcm_people;
    return `${p.first_name_en} ${p.last_name_en}`;
  });

  const actuallyPaid = inv.status === "SUCCEEDED";

  // Cannot generate receipt if not actually paid
  if (typeParam === "receipt" && !actuallyPaid) {
    return NextResponse.json(
      { error: "Receipt is not available — invoice is not paid" },
      { status: 400 }
    );
  }

  // Determine document type: invoice always shows PENDING, receipt always shows PAID
  const renderAsReceipt = typeParam === "receipt" || (typeParam === null && actuallyPaid);

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

  const eventEndDate = r.eckcm_events?.event_end_date;
  const pdfBuffer = await generateInvoicePdf({
    invoiceNumber: inv.invoice_number,
    confirmationCode: r.confirmation_code ?? "",
    eventName: r.eckcm_events?.name_en ?? "ECKCM Event",
    issuedDate: new Date(inv.issued_at).toLocaleDateString("en-US"),
    isPaid: renderAsReceipt,
    paymentMethod: renderAsReceipt ? (payment?.payment_method ?? "-") : "-",
    paymentDate: renderAsReceipt && inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("en-US") : "-",
    billTo,
    dateDue: eventEndDate ? new Date(eventEndDate + "T00:00:00").toLocaleDateString("en-US") : undefined,
    participants,
    lineItems,
    subtotal: `$${(inv.total_cents / 100).toFixed(2)}`,
    total: `$${(inv.total_cents / 100).toFixed(2)}`,
  });

  const docType = renderAsReceipt ? "receipt" : "invoice";
  const filename = `eckcm-${docType}-${inv.invoice_number}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.length),
    },
  });
}
