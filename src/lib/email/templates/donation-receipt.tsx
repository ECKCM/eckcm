import { escapeHtml } from "../utils";

export interface DonationReceiptEmailProps {
  receiptNumber: string;
  receiptDate: string;
  donorName: string | null;
  /** Total contribution charged to the donor (base + covered fees), formatted. */
  contributionFormatted: string;
  /** Base donation amount, formatted. Shown only when fees were covered. */
  baseAmountFormatted: string | null;
  /** Processing fee the donor chose to cover, formatted. null/0 → hidden. */
  coveredFeeFormatted: string | null;
  designation: string | null; // e.g. department name
  paymentReference: string; // Stripe PI / charge id
  // Org legal info
  orgLegalName: string;
  orgEin: string; // "" → omitted
  orgAddressLines: string[];
  orgContactEmail: string;
  taxExemptStatement: string;
}

export function buildDonationReceiptEmail({
  receiptNumber,
  receiptDate,
  donorName,
  contributionFormatted,
  baseAmountFormatted,
  coveredFeeFormatted,
  designation,
  paymentReference,
  orgLegalName,
  orgEin,
  orgAddressLines,
  orgContactEmail,
  taxExemptStatement,
}: DonationReceiptEmailProps): string {
  const greeting = donorName ? `Dear ${escapeHtml(donorName)},` : "Dear Friend,";
  const showFeeBreakdown = !!coveredFeeFormatted && !!baseAmountFormatted;
  const orgAddressHtml = orgAddressLines.map((l) => escapeHtml(l)).join("<br>");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <tr>
      <td>
        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 8px 8px 0 0; padding: 24px; text-align: center;">
          <tr>
            <td>
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${escapeHtml(orgLegalName)}</h1>
              <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">Official Donation Receipt</p>
            </td>
          </tr>
        </table>

        <!-- Body -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 32px; border: 1px solid #e5e7eb;">
          <tr>
            <td>
              <p style="font-size: 16px; color: #111827; margin: 0 0 8px;">${greeting}</p>
              <p style="font-size: 14px; color: #374151; margin: 0 0 24px; line-height: 1.6;">
                Thank you for your generous contribution. This letter serves as your official
                receipt for tax purposes. Please retain it for your records.
              </p>

              <!-- Receipt meta -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 13px;">Receipt No.</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 13px; font-family: monospace; text-align: right;">${escapeHtml(receiptNumber)}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 13px;">Date</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 13px; text-align: right;">${escapeHtml(receiptDate)}</td>
                </tr>
                ${donorName ? `
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 13px;">Donor</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 13px; text-align: right;">${escapeHtml(donorName)}</td>
                </tr>` : ""}
                ${designation ? `
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 13px;">Designation</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 13px; text-align: right;">${escapeHtml(designation)}</td>
                </tr>` : ""}
              </table>

              <!-- Contribution amount -->
              <h3 style="font-size: 14px; color: #6b7280; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Contribution</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 24px;">
                ${showFeeBreakdown ? `
                <tr>
                  <td style="padding: 8px 12px; font-size: 13px; color: #6b7280;">Donation</td>
                  <td style="padding: 8px 12px; font-size: 13px; color: #111827; text-align: right;">${baseAmountFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb;">Processing fee covered by donor</td>
                  <td style="padding: 8px 12px; font-size: 13px; color: #111827; text-align: right; border-top: 1px solid #e5e7eb;">${coveredFeeFormatted}</td>
                </tr>` : ""}
                <tr style="background-color: #f0fdf4;">
                  <td style="padding: 12px; font-size: 14px; color: #111827; font-weight: bold; ${showFeeBreakdown ? "border-top: 1px solid #e5e7eb;" : ""}">Total Tax-Deductible Contribution</td>
                  <td style="padding: 12px; font-size: 18px; font-weight: bold; color: #15803d; text-align: right; ${showFeeBreakdown ? "border-top: 1px solid #e5e7eb;" : ""}">${contributionFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">Payment Reference</td>
                  <td style="padding: 8px 12px; font-size: 12px; color: #6b7280; font-family: monospace; text-align: right; border-top: 1px solid #e5e7eb;">${escapeHtml(paymentReference)}</td>
                </tr>
              </table>

              <!-- Tax statement -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 8px;">
                <tr>
                  <td>
                    <p style="font-size: 13px; color: #1e40af; margin: 0; line-height: 1.6;">${escapeHtml(taxExemptStatement)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Footer (org legal identity) -->
        <table width="100%" cellpadding="0" cellspacing="0" style="padding: 16px; text-align: center;">
          <tr>
            <td>
              <p style="font-size: 13px; color: #374151; margin: 0 0 4px; font-weight: bold;">${escapeHtml(orgLegalName)}</p>
              <p style="font-size: 12px; color: #9ca3af; margin: 0;">${orgAddressHtml}</p>
              ${orgEin ? `<p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">EIN: ${escapeHtml(orgEin)}</p>` : ""}
              <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">${escapeHtml(orgContactEmail)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
