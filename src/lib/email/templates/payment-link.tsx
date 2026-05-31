import { escapeHtml } from "../utils";

interface PaymentLinkEmailProps {
  eventName: string;
  eventDates: string;
  confirmationCode: string;
  payUrl: string;
}

/**
 * Email sent to a SUBMITTED (awaiting-payment) registrant with a one-click
 * card-payment link. No login required. The exact amount is shown on the
 * payment page itself (card list price, manual-payment discount excluded), so
 * we intentionally do NOT print a dollar figure here.
 */
export function buildPaymentLinkEmail({
  eventName,
  eventDates,
  confirmationCode,
  payUrl,
}: PaymentLinkEmailProps): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background: #ffffff;">
    <tr>
      <td style="padding: 32px 24px; text-align: center; background: linear-gradient(135deg, #1e40af, #3b82f6);">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">Complete Your Payment</h1>
        <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">${escapeHtml(eventName)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px 24px;">
        <p style="margin: 0 0 16px; font-size: 16px; color: #111827;">
          Hello,
        </p>
        <p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; line-height: 1.6;">
          Your registration for <strong>${escapeHtml(eventName)}</strong> (${escapeHtml(eventDates)})
          is awaiting payment. You can pay securely by card using the button below —
          no login required. Once payment completes, your registration is confirmed and
          your E-Pass is activated automatically.
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f3f4f6; border-radius: 8px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 16px 20px;">
              <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Confirmation Code</p>
              <p style="margin: 0; font-size: 24px; font-weight: 700; color: #111827; letter-spacing: 0.1em;">${escapeHtml(confirmationCode)}</p>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="text-align: center; padding: 0 0 24px;">
              <a href="${payUrl}" style="display: block; padding: 18px 24px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 18px; line-height: 1.2; text-align: center;">
                Pay by Card
              </a>
            </td>
          </tr>
        </table>

        <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
          The exact amount due is shown on the payment page. This link is for your
          registration only — please do not share it.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          ECKCM - East Coast Korean Camp Meeting
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
