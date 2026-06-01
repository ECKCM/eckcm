import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { generateDonationReceiptPdf } from "@/lib/pdf/generate-donation-receipt";
import { donationReceiptNumber } from "@/lib/donation/receipt-info";
import { formatCurrency } from "@/lib/utils/formatters";

/**
 * GET /api/admin/donations/[id]/receipt
 * Returns the official donation tax-receipt PDF for any donation record,
 * generated from its live data (so admins can save/re-send it).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: d } = await admin
    .from("eckcm_donations")
    .select(
      "id, donor_name, amount_cents, fee_cents, covers_fees, stripe_payment_intent_id, metadata, created_at"
    )
    .eq("id", id)
    .single();

  if (!d) {
    return NextResponse.json({ error: "Donation not found" }, { status: 404 });
  }

  const meta = (d.metadata as Record<string, unknown> | null) ?? {};
  const baseCents: number = d.amount_cents ?? 0;
  const feeCents: number = d.fee_cents ?? 0;
  const coveredFees = !!d.covers_fees && feeCents > 0;
  const designation = (meta.designation as string | undefined) ?? "Camp Meeting (General)";

  const receiptDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(d.created_at));

  const receiptNumber = donationReceiptNumber(d.id);
  const pdf = await generateDonationReceiptPdf({
    receiptNumber,
    receiptDate,
    donorName: d.donor_name ?? null,
    contributionFormatted: formatCurrency(baseCents + feeCents),
    baseAmountFormatted: coveredFees ? formatCurrency(baseCents) : null,
    coveredFeeFormatted: coveredFees ? formatCurrency(feeCents) : null,
    designation,
    paymentReference: d.stripe_payment_intent_id ?? "-",
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="donation-receipt-${receiptNumber}.pdf"`,
      "Content-Length": String(pdf.length),
    },
  });
}
