interface ConfirmationEmailProps {
  confirmationCode: string;
  eventName: string;
  eventLocation: string;
  eventDates: string;
  participants: Array<{
    name: string;
    epassUrl: string;
  }>;
  totalAmount: string;
  paymentMethod?: string | null;
  zelleInfo?: {
    zelleEmail: string;
    accountHolder: string;
    memo: string;
  } | null;
}

export function buildConfirmationEmail({
  confirmationCode,
  eventName,
  eventLocation,
  eventDates,
  participants,
  totalAmount,
  paymentMethod,
  zelleInfo,
}: ConfirmationEmailProps): string {
  const isZelle = paymentMethod === "ZELLE";
  const participantRows = participants
    .map(
      (p, i) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${i + 1}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${p.name}</td>
          ${isZelle ? "" : `<td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">
            <a href="${p.epassUrl}" style="color: #2563eb; text-decoration: underline;">View E-Pass</a>
          </td>`}
        </tr>`
    )
    .join("");

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
              <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">${isZelle ? "Registration Submitted" : "Registration Confirmation"}</p>
            </td>
          </tr>
        </table>

        <!-- Body -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 32px; border: 1px solid #e5e7eb;">
          <tr>
            <td>
              <p style="font-size: 16px; color: #111827; margin: 0 0 16px;">${isZelle ? "Your registration has been submitted!" : "Your registration has been confirmed!"}</p>

              <!-- Confirmation Code -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
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
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">${isZelle ? "Amount Due" : "Amount Paid"}</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 14px; font-weight: bold; text-align: right;">${totalAmount}</td>
                </tr>
              </table>

              ${isZelle && zelleInfo ? `
              <!-- Zelle Payment Instructions -->
              <h3 style="font-size: 14px; color: #6b7280; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Zelle Payment Instructions</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #faf5ff; border: 1px solid #e9d5ff; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <tr>
                  <td>
                    <p style="font-size: 14px; color: #6b21a8; margin: 0 0 12px;">Please send your Zelle payment using the details below:</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">1. Send with Zelle to:</td>
                        <td style="padding: 4px 0; color: #111827; font-size: 14px; font-weight: bold; text-align: right;">${zelleInfo.zelleEmail}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">2. Account Holder:</td>
                        <td style="padding: 4px 0; color: #111827; font-size: 14px; font-weight: bold; text-align: right;">${zelleInfo.accountHolder}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">3. Amount:</td>
                        <td style="padding: 4px 0; color: #111827; font-size: 14px; font-weight: bold; text-align: right;">${totalAmount}</td>
                      </tr>
                    </table>
                    <p style="font-size: 14px; color: #6b7280; margin: 12px 0 4px;">4. Memo/Note <span style="color: #dc2626; font-weight: bold;">(Required)</span>:</p>
                    <p style="font-size: 14px; font-family: monospace; background: #ffffff; border: 1px solid #e9d5ff; border-radius: 4px; padding: 8px 12px; color: #111827; margin: 0 0 12px; word-break: break-all;">${zelleInfo.memo}</p>
                    <p style="font-size: 12px; color: #7c3aed; margin: 0 0 12px;">Please copy and paste the memo exactly as shown so we can match your payment.</p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px;">
                      <tr>
                        <td>
                          <p style="font-size: 13px; font-weight: bold; color: #92400e; margin: 0 0 4px;">Important</p>
                          <p style="font-size: 12px; color: #a16207; margin: 0;">Your registration will remain in &ldquo;Pending Payment&rdquo; status until your Zelle payment is received and verified. This may take 1-3 business days. Room assignments will not be made until payment is confirmed.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              ` : ""}

              <!-- Participants -->
              <h3 style="font-size: 14px; color: #6b7280; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Participants${isZelle ? "" : " & E-Pass"}</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 24px;">
                <tr style="background-color: #f9fafb;">
                  <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280;">#</th>
                  <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280;">Name</th>
                  ${isZelle ? "" : '<th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280;">E-Pass</th>'}
                </tr>
                ${participantRows}
              </table>

              <p style="font-size: 13px; color: #6b7280; margin: 0;">
                ${isZelle
                  ? "E-Pass links will be sent in a separate email once your payment is confirmed."
                  : "Each participant can use their E-Pass link for check-in at the event. You can also view all E-Passes from your dashboard."}
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="padding: 16px; text-align: center;">
          <tr>
            <td>
              <p style="font-size: 12px; color: #9ca3af; margin: 0;">
                Eastern Korean Churches Camp Meeting
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
