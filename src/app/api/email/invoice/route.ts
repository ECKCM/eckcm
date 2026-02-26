import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { emailInvoiceSchema } from "@/lib/schemas/api";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const FROM_EMAIL =
  process.env.EMAIL_FROM || "ECKCM <noreply@my.eckcm.com>";

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

  // Load invoice with registration ownership check
  const { data: invoice } = await admin
    .from("eckcm_invoices")
    .select(
      `
      id,
      invoice_number,
      total_amount_cents,
      status,
      created_at,
      registration_id,
      eckcm_invoice_line_items(description, amount_cents, quantity)
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

  // Verify user owns the registration linked to this invoice
  const inv = invoice as typeof invoice & {
    registration_id: string;
    eckcm_invoice_line_items: { description: string; amount_cents: number; quantity: number }[];
  };
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("created_by_user_id")
    .eq("id", inv.registration_id)
    .single();

  if (!reg || reg.created_by_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only send to the authenticated user's own email (prevent injection)
  const recipientEmail = user.email;

  if (!recipientEmail) {
    return NextResponse.json(
      { error: "No recipient email" },
      { status: 400 }
    );
  }

  const lineItems = (inv.eckcm_invoice_line_items ?? [])
    .map(
      (li: { description: string; amount_cents: number; quantity: number }) =>
        `${li.description}: $${((li.amount_cents * li.quantity) / 100).toFixed(2)}`
    )
    .join("\n");

  try {
    const resend = getResendClient();
    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject: `ECKCM Invoice #${inv.invoice_number}`,
      text: `Invoice #${inv.invoice_number}\n\n${lineItems}\n\nTotal: $${(inv.total_amount_cents / 100).toFixed(2)}\nStatus: ${inv.status}\n\nThank you for your registration.`,
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
