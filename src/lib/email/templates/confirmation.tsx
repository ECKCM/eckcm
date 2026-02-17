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
}

export function buildConfirmationEmail({
  confirmationCode,
  eventName,
  eventLocation,
  eventDates,
  participants,
  totalAmount,
}: ConfirmationEmailProps): string {
  const participantRows = participants
    .map(
      (p, i) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${i + 1}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${p.name}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">
            <a href="${p.epassUrl}" style="color: #2563eb; text-decoration: underline;">View E-Pass</a>
          </td>
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
              <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">Registration Confirmation</p>
            </td>
          </tr>
        </table>

        <!-- Body -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 32px; border: 1px solid #e5e7eb;">
          <tr>
            <td>
              <p style="font-size: 16px; color: #111827; margin: 0 0 16px;">Your registration has been confirmed!</p>

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
                  <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Amount Paid</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 14px; font-weight: bold; text-align: right;">${totalAmount}</td>
                </tr>
              </table>

              <!-- Participants -->
              <h3 style="font-size: 14px; color: #6b7280; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Participants & E-Pass</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 24px;">
                <tr style="background-color: #f9fafb;">
                  <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280;">#</th>
                  <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280;">Name</th>
                  <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280;">E-Pass</th>
                </tr>
                ${participantRows}
              </table>

              <p style="font-size: 13px; color: #6b7280; margin: 0;">
                Each participant can use their E-Pass link for check-in at the event.
                You can also view all E-Passes from your dashboard.
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
