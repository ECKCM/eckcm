interface RefundEmailProps {
  confirmationCode: string;
  eventName: string;
  eventLocation: string;
  eventDates: string;
  refundAmountFormatted: string;
  originalAmountFormatted: string;
  remainingBalanceFormatted: string | null; // null = full refund
  reason: string;
  paymentMethod: string;
  refundDate: string;
}

export function buildRefundEmail({
  confirmationCode,
  eventName,
  eventLocation,
  eventDates,
  refundAmountFormatted,
  originalAmountFormatted,
  remainingBalanceFormatted,
  reason,
  paymentMethod,
  refundDate,
}: RefundEmailProps): string {
  const isFullRefund = !remainingBalanceFormatted;
  const refundMethodNote = paymentMethod === "STRIPE"
    ? "Your refund will be returned to the original payment method (credit/debit card). Please allow 5-10 business days for the refund to appear on your statement."
    : paymentMethod === "ZELLE"
      ? "Your Zelle refund will be processed separately. Please allow 1-3 business days."
      : paymentMethod === "CHECK"
        ? "Your refund check will be mailed to you. Please allow 1-2 weeks for delivery."
        : "Your refund will be processed and returned via the original payment method.";

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
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">ECKCM</h1>
              <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">Refund Notification</p>
            </td>
          </tr>
        </table>

        <!-- Body -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 32px; border: 1px solid #e5e7eb;">
          <tr>
            <td>
              <p style="font-size: 16px; color: #111827; margin: 0 0 16px;">
                ${isFullRefund ? "Your registration has been fully refunded." : "A partial refund has been issued for your registration."}
              </p>

              <!-- Confirmation Code -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <tr>
                  <td>
                    <p style="font-size: 12px; color: #6b7280; margin: 0;">Confirmation Code</p>
                    <p style="font-size: 32px; font-family: monospace; font-weight: bold; color: #111827; margin: 8px 0 0; letter-spacing: 4px;">${confirmationCode}</p>
                  </td>
                </tr>
              </table>

              <!-- Event Details -->
              <h3 style="font-size: 14px; color: #6b7280; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Event Details</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Event</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 14px; text-align: right;">${eventName}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Location</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 14px; text-align: right;">${eventLocation}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Dates</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 14px; text-align: right;">${eventDates}</td>
                </tr>
              </table>

              <!-- Refund Details -->
              <h3 style="font-size: 14px; color: #6b7280; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Refund Details</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 24px;">
                <tr style="background-color: #fef2f2;">
                  <td style="padding: 12px; font-size: 14px; color: #6b7280;">Refund Amount</td>
                  <td style="padding: 12px; font-size: 18px; font-weight: bold; color: #dc2626; text-align: right;">${refundAmountFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb;">Original Amount</td>
                  <td style="padding: 8px 12px; font-size: 13px; color: #111827; text-align: right; border-top: 1px solid #e5e7eb;">${originalAmountFormatted}</td>
                </tr>
                ${!isFullRefund ? `
                <tr>
                  <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb;">Remaining Balance</td>
                  <td style="padding: 8px 12px; font-size: 13px; color: #111827; font-weight: bold; text-align: right; border-top: 1px solid #e5e7eb;">${remainingBalanceFormatted}</td>
                </tr>` : ""}
                <tr>
                  <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb;">Refund Date</td>
                  <td style="padding: 8px 12px; font-size: 13px; color: #111827; text-align: right; border-top: 1px solid #e5e7eb;">${refundDate}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb;">Reason</td>
                  <td style="padding: 8px 12px; font-size: 13px; color: #111827; text-align: right; border-top: 1px solid #e5e7eb;">${reason}</td>
                </tr>
              </table>

              <!-- Refund Method Note -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <tr>
                  <td>
                    <p style="font-size: 13px; color: #1e40af; margin: 0;">${refundMethodNote}</p>
                  </td>
                </tr>
              </table>

              <p style="font-size: 13px; color: #6b7280; margin: 0;">
                If you have any questions about this refund, please contact us.
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="padding: 16px; text-align: center;">
          <tr>
            <td>
              <p style="font-size: 12px; color: #9ca3af; margin: 0;">
                East Coast Korean Camp Meeting
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
