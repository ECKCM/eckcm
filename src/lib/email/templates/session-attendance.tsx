interface SessionAttendanceEmailProps {
  sessionName: string;
  sessionDate: string;
  sessionTime: string;
  location: string;
  totalAttendees: number;
  attendees: Array<{
    name: string;
    checkedInAt: string;
  }>;
}

export function buildSessionAttendanceEmail({
  sessionName,
  sessionDate,
  sessionTime,
  location,
  totalAttendees,
  attendees,
}: SessionAttendanceEmailProps): string {
  const attendeeRows = attendees
    .map(
      (a, i) => `
        <tr>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">${i + 1}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px;">${a.name}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${a.checkedInAt}</td>
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
              <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">Session Attendance Report</p>
            </td>
          </tr>
        </table>

        <!-- Body -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 32px; border: 1px solid #e5e7eb;">
          <tr>
            <td>
              <!-- Session Details -->
              <h2 style="font-size: 18px; color: #111827; margin: 0 0 16px;">${sessionName}</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Date</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 14px; text-align: right;">${sessionDate}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Time</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 14px; text-align: right;">${sessionTime}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Location</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 14px; text-align: right;">${location}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Total Attendees</td>
                  <td style="padding: 4px 0; color: #111827; font-size: 14px; font-weight: bold; text-align: right;">${totalAttendees}</td>
                </tr>
              </table>

              <!-- Attendee List -->
              <h3 style="font-size: 14px; color: #6b7280; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Attendees</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px;">
                <tr style="background-color: #f9fafb;">
                  <th style="padding: 6px 12px; text-align: left; font-size: 12px; color: #6b7280;">#</th>
                  <th style="padding: 6px 12px; text-align: left; font-size: 12px; color: #6b7280;">Name</th>
                  <th style="padding: 6px 12px; text-align: left; font-size: 12px; color: #6b7280;">Checked In</th>
                </tr>
                ${attendeeRows}
              </table>
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
