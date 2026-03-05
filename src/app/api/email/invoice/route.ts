import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { buildInvoiceEmail } from "@/lib/email/templates/invoice";
import { generateInvoicePdf } from "@/lib/pdf/generate";
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
      subtotal_cents,
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
    .select("created_by_user_id, confirmation_code, event_id, eckcm_events!inner(name_en)")
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

  const html = buildInvoiceEmail({
    invoiceNumber: inv.invoice_number,
    confirmationCode: reg.confirmation_code ?? "",
    eventName,
    lineItems,
    subtotal: `$${((inv.subtotal_cents ?? inv.total_cents) / 100).toFixed(2)}`,
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

  // Generate PDF attachment
  let pdfAttachment: { filename: string; content: Buffer } | null = null;
  try {
    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber: inv.invoice_number,
      confirmationCode: reg.confirmation_code ?? "",
      eventName,
      issuedDate: new Date(inv.issued_at).toLocaleDateString("en-US"),
      isPaid,
      paymentMethod: payment?.payment_method ?? "-",
      paymentDate: inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("en-US") : "-",
      lineItems,
      subtotal: `$${((inv.subtotal_cents ?? inv.total_cents) / 100).toFixed(2)}`,
      total: `$${(inv.total_cents / 100).toFixed(2)}`,
    });
    pdfAttachment = {
      filename: `eckcm-${isPaid ? "receipt" : "invoice"}-${inv.invoice_number}.pdf`,
      content: pdfBuffer,
    };
  } catch (err) {
    logger.error("[email/invoice] PDF generation failed", { error: String(err) });
  }

  try {
    const resend = await getResendClient();
    const { data: sendResult, error } = await resend.emails.send({
      from: emailConfig.from,
      to: recipientEmail,
      ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
      subject,
      html,
      ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}),
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
