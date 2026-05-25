/**
 * Announcement email template wrapper.
 *
 * Pure HTML-string builder so it works identically on the server (Resend
 * payload) and the client (live preview iframe). Body HTML must be
 * sanitized by the caller before being passed in.
 */

export interface BuildAnnouncementHtmlArgs {
  subject: string;
  /** Already-sanitized rich-text body. */
  bodyHtml: string;
  eventName: string;
  unsubscribeEmail: string;
}

export function buildAnnouncementHtml({
  subject,
  bodyHtml,
  eventName,
  unsubscribeEmail,
}: BuildAnnouncementHtmlArgs): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeAttr(subject)}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px;">
    <tr>
      <td>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;border-radius:8px 8px 0 0;padding:24px;text-align:center;">
          <tr>
            <td>
              <h1 style="color:#ffffff;margin:0;font-size:24px;">ECKCM</h1>
              <p style="color:#fbbf24;margin:10px 0 0;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Announcement &middot; 공지</p>
              <p style="color:#94a3b8;margin:6px 0 0;font-size:14px;">${escapeText(eventName)}</p>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;padding:32px;border:1px solid #e5e7eb;">
          <tr>
            <td>
              <h2 style="font-size:20px;color:#111827;margin:0 0 16px;">${escapeText(subject)}</h2>
              <div style="font-size:15px;color:#374151;line-height:1.6;">
                ${bodyHtml}
              </div>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:16px;text-align:center;">
          <tr>
            <td>
              <p style="font-size:12px;color:#9ca3af;margin:0 0 4px;">East Coast Korean Camp Meeting</p>
              <p style="font-size:11px;color:#9ca3af;margin:0;">
                You're receiving this because you're registered for ${escapeText(eventName)}.
                To stop receiving announcements, reply with "unsubscribe" to
                <a href="mailto:${escapeAttr(unsubscribeEmail)}?subject=Unsubscribe" style="color:#6b7280;">${escapeText(unsubscribeEmail)}</a>.
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

export function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
