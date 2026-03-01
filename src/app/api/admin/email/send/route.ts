import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";
import { buildInvoiceEmail } from "@/lib/email/templates/invoice";
import { logger } from "@/lib/logger";
import { z } from "zod";

const schema = z.object({
  registrationId: z.string().uuid(),
  type: z.enum(["confirmation", "invoice"]),
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

  // type === "invoice"
  // Load invoice for this registration
  const { data: invoice } = await admin
    .from("eckcm_invoices")
    .select(
      `
      id,
      invoice_number,
      subtotal_cents,
      total_cents,
      status,
      paid_at,
      registration_id,
      eckcm_invoice_line_items(description, quantity, unit_price_cents, amount_cents)
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

  // Load registration info
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("confirmation_code, event_id, created_by_user_id, eckcm_events!inner(name_en)")
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
    (li: { description: string; quantity: number; unit_price_cents: number; amount_cents: number }) => ({
      description: li.description,
      quantity: li.quantity,
      unitPrice: `$${(li.unit_price_cents / 100).toFixed(2)}`,
      amount: `$${(li.amount_cents / 100).toFixed(2)}`,
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

  try {
    const resend = await getResendClient();
    const { data: sendResult, error } = await resend.emails.send({
      from: emailConfig.from,
      to: registrant.email,
      ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
      subject,
      html,
    });

    if (error) {
      await logEmail({
        eventId: reg.event_id,
        toEmail: registrant.email,
        fromEmail: emailConfig.from,
        subject,
        template: isPaid ? "receipt" : "invoice",
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
      template: isPaid ? "receipt" : "invoice",
      registrationId,
      invoiceId: inv.id,
      status: "sent",
      resendId: sendResult?.id,
      sentBy: auth.user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[admin/email/send] Invoice email failed", { error: String(error) });
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
