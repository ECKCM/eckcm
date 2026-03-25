import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig, getEmailHeaders } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { buildInvoiceEmail } from "@/lib/email/templates/invoice";
import { generateInvoicePdf } from "@/lib/pdf/generate";
import { generateRegistrationSummaryPdf, type SummaryParticipant } from "@/lib/pdf/generate-summary";
import { emailInvoiceSchema } from "@/lib/schemas/api";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`email:${user.id}`, 3, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = emailInvoiceSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { invoiceId } = parsed.data;

  const admin = createAdminClient();

  // Load invoice with line items
  const { data: invoice } = await admin
    .from("eckcm_invoices")
    .select(
      `
      id,
      invoice_number,
      total_cents,
      status,
      issued_at,
      paid_at,
      registration_id,
      eckcm_invoice_line_items(description_en, quantity, unit_price_cents, total_cents)
    `
    )
    .eq("id", invoiceId)
    .single();

  if (!invoice) {
    return NextResponse.json(
      { error: "Invoice not found" },
      { status: 404 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inv = invoice as any;

  // Verify user owns the registration linked to this invoice
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("created_by_user_id, confirmation_code, event_id, start_date, end_date, nights_count, registration_type, status, total_amount_cents, eckcm_events!inner(name_en, event_end_date)")
    .eq("id", inv.registration_id)
    .single();

  if (!reg || reg.created_by_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const recipientEmail = user.email;
  if (!recipientEmail) {
    return NextResponse.json(
      { error: "No recipient email" },
      { status: 400 }
    );
  }

  // Load payment info
  const { data: payment } = await admin
    .from("eckcm_payments")
    .select("payment_method")
    .eq("invoice_id", invoiceId)
    .in("status", ["SUCCEEDED", "PARTIALLY_REFUNDED"])
    .limit(1)
    .maybeSingle();

  // Build HTML email using template
  const lineItems = (inv.eckcm_invoice_line_items ?? []).map(
    (li: { description_en: string; quantity: number; unit_price_cents: number; total_cents: number }) => ({
      description: li.description_en,
      quantity: li.quantity,
      unitPrice: `$${(li.unit_price_cents / 100).toFixed(2)}`,
      amount: `$${(li.total_cents / 100).toFixed(2)}`,
    })
  );

  const isPaid = inv.status === "SUCCEEDED";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventName = (reg as any).eckcm_events?.name_en ?? "ECKCM Event";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventEndDate = (reg as any).eckcm_events?.event_end_date;

  const html = buildInvoiceEmail({
    invoiceNumber: inv.invoice_number,
    confirmationCode: reg.confirmation_code ?? "",
    eventName,
    lineItems,
    subtotal: `$${(inv.total_cents / 100).toFixed(2)}`,
    total: `$${(inv.total_cents / 100).toFixed(2)}`,
    paymentMethod: payment?.payment_method ?? "-",
    paymentDate: inv.paid_at
      ? new Date(inv.paid_at).toLocaleDateString("en-US")
      : "-",
  });

  const emailConfig = await getEmailConfig();
  const subject = isPaid
    ? `ECKCM Receipt - ${inv.invoice_number}`
    : `ECKCM Invoice - ${inv.invoice_number}`;

  // Generate PDF attachments — Invoice (always) + Receipt (if paid)
  const pdfAttachments: { filename: string; content: Buffer }[] = [];
  try {
    const basePdfData = {
      invoiceNumber: inv.invoice_number,
      confirmationCode: reg.confirmation_code ?? "",
      eventName,
      issuedDate: new Date(inv.issued_at).toLocaleDateString("en-US"),
      billTo: recipientEmail,
      dateDue: eventEndDate ? new Date(eventEndDate + "T00:00:00").toLocaleDateString("en-US") : undefined,
      lineItems,
      subtotal: `$${(inv.total_cents / 100).toFixed(2)}`,
      total: `$${(inv.total_cents / 100).toFixed(2)}`,
    };

    // Always attach Invoice PDF (PENDING PAYMENT)
    const invoicePdfBuffer = await generateInvoicePdf({
      ...basePdfData,
      isPaid: false,
      paymentMethod: "-",
      paymentDate: "-",
    });
    pdfAttachments.push({
      filename: `eckcm-invoice-${inv.invoice_number}.pdf`,
      content: invoicePdfBuffer,
    });

    // If paid, also attach Receipt PDF (PAID)
    if (isPaid) {
      const receiptPdfBuffer = await generateInvoicePdf({
        ...basePdfData,
        isPaid: true,
        paymentMethod: payment?.payment_method ?? "-",
        paymentDate: inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("en-US") : "-",
      });
      pdfAttachments.push({
        filename: `eckcm-receipt-${inv.invoice_number}.pdf`,
        content: receiptPdfBuffer,
      });
    }
  } catch (err) {
    logger.error("[email/invoice] PDF generation failed", { error: String(err) });
  }

  // Generate Registration Summary PDF
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = reg as any;
  try {
    const { data: memberships } = await admin
      .from("eckcm_group_memberships")
      .select(`
        role,
        eckcm_people!inner(
          first_name_en, last_name_en, display_name_ko,
          gender, age_at_event, is_k12, grade,
          phone, email, church_other,
          guardian_name, guardian_phone,
          eckcm_churches(name_en),
          eckcm_departments(name_en)
        ),
        eckcm_groups!inner(registration_id, display_group_code)
      `)
      .eq("eckcm_groups.registration_id", inv.registration_id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summaryParticipants: SummaryParticipant[] = (memberships ?? []).map((m: any) => {
      const p = m.eckcm_people;
      return {
        name: `${p.first_name_en} ${p.last_name_en}`,
        nameKo: p.display_name_ko,
        gender: p.gender ?? "-",
        age: p.age_at_event,
        isK12: p.is_k12 ?? false,
        grade: p.grade,
        email: p.email,
        phone: p.phone,
        church: p.church_other || p.eckcm_churches?.name_en || null,
        department: p.eckcm_departments?.name_en ?? null,
        guardianName: p.guardian_name,
        guardianPhone: p.guardian_phone,
        groupCode: m.eckcm_groups?.display_group_code ?? "-",
        role: m.role ?? "MEMBER",
      };
    });

    const totalAmount = `$${(r.total_amount_cents / 100).toFixed(2)}`;
    const summaryPdfBuffer = await generateRegistrationSummaryPdf({
      confirmationCode: r.confirmation_code ?? "",
      eventName,
      startDate: r.start_date,
      endDate: r.end_date,
      nightsCount: r.nights_count ?? 0,
      status: r.status,
      registrantName: summaryParticipants.find(p => p.role === "REPRESENTATIVE")?.name ?? recipientEmail,
      registrantEmail: recipientEmail,
      registrationType: r.registration_type ?? "self",
      totalAmount,
      participants: summaryParticipants,
      lineItems,
      subtotal: `$${(inv.total_cents / 100).toFixed(2)}`,
      total: `$${(inv.total_cents / 100).toFixed(2)}`,
    });
    pdfAttachments.push({
      filename: `eckcm-summary-${r.confirmation_code ?? "reg"}.pdf`,
      content: summaryPdfBuffer,
    });
  } catch (err) {
    logger.error("[email/invoice] Summary PDF generation failed", { error: String(err) });
  }

  try {
    const resend = await getResendClient();
    const { data: sendResult, error } = await resend.emails.send({
      from: emailConfig.from,
      to: recipientEmail,
      ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
      subject,
      html,
      headers: getEmailHeaders(),
      ...(pdfAttachments.length > 0 ? { attachments: pdfAttachments } : {}),
    });

    if (error) {
      await logEmail({
        eventId: reg.event_id,
        toEmail: recipientEmail,
        fromEmail: emailConfig.from,
        subject,
        template: isPaid ? "receipt" : "invoice",
        registrationId: inv.registration_id,
        invoiceId: inv.id,
        status: "failed",
        errorMessage: error.message,
      });
      logger.error("[email/invoice] Resend error", { error });
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    await logEmail({
      eventId: reg.event_id,
      toEmail: recipientEmail,
      fromEmail: emailConfig.from,
      subject,
      template: isPaid ? "receipt" : "invoice",
      registrationId: inv.registration_id,
      invoiceId: inv.id,
      status: "sent",
      resendId: sendResult?.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[email/invoice] Failed", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to send invoice email" },
      { status: 500 }
    );
  }
}
