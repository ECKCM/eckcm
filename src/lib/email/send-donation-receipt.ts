import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig, getEmailHeaders } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { buildDonationReceiptEmail } from "@/lib/email/templates/donation-receipt";
import { generateDonationReceiptPdf } from "@/lib/pdf/generate-donation-receipt";
import {
  DONATION_RECEIPT_ORG_INFO,
  isReceiptOrgInfoComplete,
  donationReceiptNumber,
} from "@/lib/donation/receipt-info";
import { logger } from "@/lib/logger";
import { withTimeout } from "@/lib/utils/with-timeout";
import { formatCurrency } from "@/lib/utils/formatters";

/**
 * Send an IRS-style donation tax receipt to the donor.
 *
 * Non-blocking: errors are logged but never thrown (call inside `after()`).
 * Idempotency is delegated to the caller — both /api/donation/confirm and the
 * Stripe webhook only invoke this on the PENDING→SUCCEEDED transition, so the
 * "already SUCCEEDED → return early" guards in those routes ensure one send.
 *
 * Skips silently (info log) when:
 *   - the donor did not provide an email (nothing to send to), or
 *   - the donation is not SUCCEEDED, or
 *   - org legal info is incomplete (won't send a non-compliant receipt).
 */
export async function sendDonationReceiptEmail(donationId: string): Promise<void> {
  try {
    if (!isReceiptOrgInfoComplete()) {
      logger.warn(
        "[sendDonationReceiptEmail] Org legal info incomplete — skipping receipt. " +
          "Fill src/lib/donation/receipt-info.ts (legalName + taxExemptStatement).",
        { donationId }
      );
      return;
    }

    const admin = createAdminClient();

    const { data: donation } = await admin
      .from("eckcm_donations")
      .select(
        "id, donor_name, donor_email, amount_cents, fee_cents, covers_fees, status, stripe_payment_intent_id, metadata"
      )
      .eq("id", donationId)
      .single();

    if (!donation) {
      logger.warn("[sendDonationReceiptEmail] Donation not found", { donationId });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = donation as any;

    if (d.status !== "SUCCEEDED") {
      logger.info("[sendDonationReceiptEmail] Donation not SUCCEEDED — skipping", {
        donationId,
        status: d.status,
      });
      return;
    }

    if (!d.donor_email) {
      logger.info(
        "[sendDonationReceiptEmail] No donor email — cannot send receipt",
        { donationId }
      );
      return;
    }

    const baseCents: number = d.amount_cents ?? 0;
    const feeCents: number = d.fee_cents ?? 0;
    const coveredFees = !!d.covers_fees && feeCents > 0;
    // The full amount that left the donor's account IS the contribution.
    const contributionCents = baseCents + feeCents;

    const designation: string | null =
      (d.metadata && typeof d.metadata === "object"
        ? (d.metadata.designation as string | undefined)
        : undefined) ?? null;

    // Receipt date in US Eastern (gathering is East Coast — see project memory).
    const receiptDate = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/New_York",
    }).format(new Date());

    const receiptNumber = donationReceiptNumber(d.id);
    const contributionFormatted = formatCurrency(contributionCents);
    const baseAmountFormatted = coveredFees ? formatCurrency(baseCents) : null;
    const coveredFeeFormatted = coveredFees ? formatCurrency(feeCents) : null;
    const paymentReference = d.stripe_payment_intent_id ?? "-";

    const html = buildDonationReceiptEmail({
      receiptNumber,
      receiptDate,
      donorName: d.donor_name ?? null,
      contributionFormatted,
      baseAmountFormatted,
      coveredFeeFormatted,
      designation,
      paymentReference,
      orgLegalName: DONATION_RECEIPT_ORG_INFO.legalName,
      orgEin: DONATION_RECEIPT_ORG_INFO.ein,
      orgAddressLines: DONATION_RECEIPT_ORG_INFO.addressLines,
      orgContactEmail: DONATION_RECEIPT_ORG_INFO.contactEmail,
      taxExemptStatement: DONATION_RECEIPT_ORG_INFO.taxExemptStatement,
    });

    const subject = `${DONATION_RECEIPT_ORG_INFO.legalName} — Donation Receipt ${receiptNumber}`;

    const text = [
      "Thank you for your generous contribution.",
      "Your official tax receipt is attached as a PDF.",
      "",
      `Receipt No.: ${receiptNumber}`,
      `Date: ${receiptDate}`,
      ...(d.donor_name ? [`Donor: ${d.donor_name}`] : []),
      ...(designation ? [`Designation: ${designation}`] : []),
      `Total Tax-Deductible Contribution: ${contributionFormatted}`,
      `Payment Reference: ${paymentReference}`,
      "",
      DONATION_RECEIPT_ORG_INFO.taxExemptStatement,
      "",
      DONATION_RECEIPT_ORG_INFO.legalName,
      ...DONATION_RECEIPT_ORG_INFO.addressLines,
      ...(DONATION_RECEIPT_ORG_INFO.ein ? [`EIN: ${DONATION_RECEIPT_ORG_INFO.ein}`] : []),
    ].join("\n");

    // Generate the official receipt PDF (15s timeout — never block delivery).
    const pdfAttachments: { filename: string; content: Buffer }[] = [];
    try {
      const pdf = await withTimeout(
        generateDonationReceiptPdf({
          receiptNumber,
          receiptDate,
          donorName: d.donor_name ?? null,
          contributionFormatted,
          baseAmountFormatted,
          coveredFeeFormatted,
          designation,
          paymentReference,
        }),
        15_000,
        "Donation receipt PDF generation timeout"
      );
      pdfAttachments.push({
        filename: `donation-receipt-${receiptNumber}.pdf`,
        content: pdf,
      });
    } catch (err) {
      logger.error("[sendDonationReceiptEmail] PDF generation failed", {
        donationId,
        error: String(err),
      });
    }

    const [emailConfig, resend] = await Promise.all([
      getEmailConfig(),
      getResendClient(),
    ]);

    const { data: sendResult, error } = await resend.emails.send({
      from: emailConfig.from,
      to: [d.donor_email],
      ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
      subject,
      html,
      text,
      headers: getEmailHeaders(),
      ...(pdfAttachments.length > 0 ? { attachments: pdfAttachments } : {}),
    });

    if (error) {
      logger.error("[sendDonationReceiptEmail] Resend error", {
        donationId,
        error: error.message,
      });
      await logEmail({
        toEmail: d.donor_email,
        fromEmail: emailConfig.from,
        subject,
        template: "donation_receipt",
        status: "failed",
        errorMessage: error.message,
      });
    } else {
      logger.info("[sendDonationReceiptEmail] Receipt sent", {
        donationId,
        to: d.donor_email,
      });
      await logEmail({
        toEmail: d.donor_email,
        fromEmail: emailConfig.from,
        subject,
        template: "donation_receipt",
        status: "sent",
        resendId: sendResult?.id,
      });
    }
  } catch (err) {
    logger.error("[sendDonationReceiptEmail] Unexpected error", {
      donationId,
      error: String(err),
    });
  }
}
