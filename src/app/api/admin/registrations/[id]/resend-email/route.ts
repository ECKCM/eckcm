import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";
import { sendEPassEmails } from "@/lib/email/send-epass";

type ResendType = "confirmation" | "receipt" | "epass";

/**
 * POST /api/admin/registrations/[id]/resend-email
 * Body: { type: "confirmation" | "receipt" | "epass" }
 *
 * Re-sends one of the registration-related emails:
 * - confirmation: full confirmation email with both PDFs (invoice + receipt
 *   if paid). Same content the participant got on submit/confirm.
 * - receipt: confirmation email with only the receipt PDF attached. Use
 *   after a payment is finalized.
 * - epass: individual ePass email to each participant who has an email.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { type } = (await request.json()) as { type?: ResendType };

  if (type !== "confirmation" && type !== "receipt" && type !== "epass") {
    return NextResponse.json(
      { error: "type must be 'confirmation' | 'receipt' | 'epass'" },
      { status: 400 },
    );
  }

  try {
    if (type === "epass") {
      const result = await sendEPassEmails(id, admin.user.id);
      return NextResponse.json({ success: true, type, ...result });
    }
    await sendConfirmationEmail(
      id,
      admin.user.id,
      type === "receipt" ? { pdfMode: "receipt-only" } : undefined,
    );
    return NextResponse.json({ success: true, type });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to resend email" },
      { status: 500 },
    );
  }
}
