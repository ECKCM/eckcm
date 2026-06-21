import { escapeAttr } from "./announcement";

export interface BuildPasswordResetEmailArgs {
  resetUrl: string;
  /** Minutes until the link expires; shown in the email body. */
  expiresInMinutes: number;
}

export function buildPasswordResetEmail({
  resetUrl,
  expiresInMinutes,
}: BuildPasswordResetEmailArgs): { html: string; text: string } {
  const safeUrl = escapeAttr(resetUrl);
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your ECKCM password</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px;">
    <tr>
      <td>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;border-radius:8px 8px 0 0;padding:24px;text-align:center;">
          <tr>
            <td>
              <h1 style="color:#ffffff;margin:0;font-size:24px;">ECKCM</h1>
              <p style="color:#fbbf24;margin:10px 0 0;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Password Reset</p>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;">
          <tr>
            <td>
              <h2 style="font-size:20px;color:#111827;margin:0 0 16px;">Reset your password</h2>
              <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 24px;">
                We received a request to reset your ECKCM account password. Click the button below to choose a new one.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background-color:#0f172a;border-radius:6px;">
                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0 0 12px;">
                Or copy and paste this link into your browser:
              </p>
              <p style="font-size:12px;color:#374151;word-break:break-all;line-height:1.5;margin:0 0 24px;">
                <a href="${safeUrl}" style="color:#2563eb;text-decoration:underline;">${safeUrl}</a>
              </p>
              <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0 0 8px;">
                This link will expire in ${expiresInMinutes} minutes for security reasons.
              </p>
              <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0;">
                If you didn't request a password reset, you can safely ignore this email &mdash; your password will not change.
              </p>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:16px;text-align:center;">
          <tr>
            <td>
              <p style="font-size:12px;color:#9ca3af;margin:0;">East Coast Korean Camp Meeting</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    "Reset your ECKCM password",
    "",
    "We received a request to reset your ECKCM account password.",
    "Open the link below to choose a new one:",
    "",
    resetUrl,
    "",
    `This link expires in ${expiresInMinutes} minutes.`,
    "",
    "If you didn't request a password reset, you can safely ignore this email.",
    "",
    "East Coast Korean Camp Meeting",
  ].join("\n");

  return { html, text };
}
