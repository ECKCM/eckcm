import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig, getEmailHeaders } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";
import { buildInvoiceEmail } from "@/lib/email/templates/invoice";
import { generateInvoicePdf } from "@/lib/pdf/generate";
import { logger } from "@/lib/logger";
import { z } from "zod";

const schema = z.object({
  registrationId: z.string().uuid(),
  type: z.enum(["confirmation", "invoice", "receipt"]),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { registrationId, type } = parsed.data;
  const admin = createAdminClient();

  if (type === "confirmation") {
    try {
      await sendConfirmationEmail(registrationId, auth.user.id);
      return NextResponse.json({ success: true });
    } catch (error) {
      logger.error("[admin/email/send] Confirmation failed", { error: String(error) });
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }
  }

  // type === "invoice" or "receipt"
  const isReceiptType = type === "receipt";

  // Load invoice for this registration
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
    .eq("registration_id", registrationId)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: "No invoice found for this registration" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inv = invoice as any;
  const isPaid = inv.status === "SUCCEEDED";

  // Cannot send receipt if not paid
  if (isReceiptType && !isPaid) {
    return NextResponse.json({ error: "Cannot send receipt — invoice is not paid" }, { status: 400 });
  }

  // Load registration info
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("confirmation_code, event_id, created_by_user_id, eckcm_events!inner(name_en, event_end_date)")
    .eq("id", registrationId)
    .single();

  if (!reg) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  // Get registrant email
  const { data: { user: registrant } } = await admin.auth.admin.getUserById(reg.created_by_user_id);
  if (!registrant?.email) {
    return NextResponse.json({ error: "No email for registrant" }, { status: 400 });
  }

  // Load payment info
  const { data: payment } = await admin
    .from("eckcm_payments")
    .select("payment_method")
    .eq("invoice_id", inv.id)
    .in("status", ["SUCCEEDED", "PARTIALLY_REFUNDED"])
    .limit(1)
    .maybeSingle();

  const lineItems = (inv.eckcm_invoice_line_items ?? []).map(
    (li: { description_en: string; quantity: number; unit_price_cents: number; total_cents: number }) => ({
      description: li.description_en,
      quantity: li.quantity,
      unitPrice: `$${(li.unit_price_cents / 100).toFixed(2)}`,
      amount: `$${(li.total_cents / 100).toFixed(2)}`,
    })
  );

  // Load participant names
  const { data: memberships } = await admin
    .from("eckcm_group_memberships")
    .select("eckcm_people!inner(first_name_en, last_name_en, display_name_ko), eckcm_groups!inner(registration_id)")
    .eq("eckcm_groups.registration_id", registrationId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const participantNames = (memberships ?? []).map((m: any) => {
    const p = m.eckcm_people;
    const fullName = `${p.first_name_en} ${p.last_name_en}`;
    return p.display_name_ko ? `${fullName} (${p.display_name_ko})` : fullName;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventName = (reg as any).eckcm_events?.name_en ?? "ECKCM Event";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventEndDate = (reg as any).eckcm_events?.event_end_date;

  const html = buildInvoiceEmail({
    invoiceNumber: inv.invoice_number,
    confirmationCode: reg.confirmation_code ?? "",
    eventName,
    participants: participantNames,
    lineItems,
    subtotal: `$${(inv.total_cents / 100).toFixed(2)}`,
    total: `$${(inv.total_cents / 100).toFixed(2)}`,
    paymentMethod: isReceiptType ? (payment?.payment_method ?? "-") : "-",
    paymentDate: isReceiptType && inv.paid_at
      ? new Date(inv.paid_at).toLocaleDateString("en-US")
      : "-",
  });

  const emailConfig = await getEmailConfig();
  const docLabel = isReceiptType ? "Receipt" : "Invoice";
  const subject = `ECKCM ${docLabel} - ${inv.invoice_number}`;

  // Generate PDF attachment for the specific document type
  const pdfAttachments: { filename: string; content: Buffer }[] = [];
  try {
    const basePdfData = {
      invoiceNumber: inv.invoice_number,
      confirmationCode: reg.confirmation_code ?? "",
      eventName,
      issuedDate: new Date(inv.issued_at).toLocaleDateString("en-US"),
      billTo: registrant.email,
      dateDue: eventEndDate ? new Date(eventEndDate + "T00:00:00").toLocaleDateString("en-US") : undefined,
      participants: participantNames,
      lineItems,
      subtotal: `$${(inv.total_cents / 100).toFixed(2)}`,
      total: `$${(inv.total_cents / 100).toFixed(2)}`,
    };

    if (isReceiptType) {
      // Receipt PDF only
      const pdfBuffer = await generateInvoicePdf({
        ...basePdfData,
        isPaid: true,
        paymentMethod: payment?.payment_method ?? "-",
        paymentDate: inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("en-US") : "-",
      });
      pdfAttachments.push({
        filename: `eckcm-receipt-${inv.invoice_number}.pdf`,
        content: pdfBuffer,
      });
    } else {
      // Invoice PDF only
      const pdfBuffer = await generateInvoicePdf({
        ...basePdfData,
        isPaid: false,
        paymentMethod: "-",
        paymentDate: "-",
      });
      pdfAttachments.push({
        filename: `eckcm-invoice-${inv.invoice_number}.pdf`,
        content: pdfBuffer,
      });
    }
  } catch (err) {
    logger.error("[admin/email/send] PDF generation failed", { error: String(err) });
  }

  try {
    const resend = await getResendClient();
    const { data: sendResult, error } = await resend.emails.send({
      from: emailConfig.from,
      to: registrant.email,
      ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
      subject,
      html,
      headers: getEmailHeaders(),
      ...(pdfAttachments.length > 0 ? { attachments: pdfAttachments } : {}),
    });

    if (error) {
      await logEmail({
        eventId: reg.event_id,
        toEmail: registrant.email,
        fromEmail: emailConfig.from,
        subject,
        template: isReceiptType ? "receipt" : "invoice",
        registrationId,
        invoiceId: inv.id,
        status: "failed",
        errorMessage: error.message,
        sentBy: auth.user.id,
      });
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    await logEmail({
      eventId: reg.event_id,
      toEmail: registrant.email,
      fromEmail: emailConfig.from,
      subject,
      template: isReceiptType ? "receipt" : "invoice",
      registrationId,
      invoiceId: inv.id,
      status: "sent",
      resendId: sendResult?.id,
      sentBy: auth.user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[admin/email/send] Invoice/receipt email failed", { error: String(error) });
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
