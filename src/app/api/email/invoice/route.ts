import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";

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

  const { invoiceId, email } = await req.json();

  if (!invoiceId) {
    return NextResponse.json(
      { error: "invoiceId is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Load invoice with line items
  const { data: invoice } = await admin
    .from("eckcm_invoices")
    .select(
      `
      id,
      invoice_number,
      total_amount_cents,
      status,
      created_at,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inv = invoice as any;
  const recipientEmail = email || user.email;

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
    console.error("[email/invoice] Failed:", error);
    return NextResponse.json(
      { error: "Failed to send invoice email" },
      { status: 500 }
    );
  }
}
