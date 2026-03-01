import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { requireAdmin } from "@/lib/auth/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminCheck = await requireAdmin();
  if (!adminCheck) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { to } = await request.json();

  if (!to || typeof to !== "string") {
    return NextResponse.json(
      { error: "Missing 'to' email address" },
      { status: 400 }
    );
  }

  const emailConfig = await getEmailConfig();
  const resend = await getResendClient();

  // Try configured from address first, fallback to Resend test address if domain not verified
  const fromAddresses = [
    emailConfig.from,
    "ECKCM <onboarding@resend.dev>",
  ];

  let lastError: unknown = null;
  for (const from of fromAddresses) {
    const { data: sendResult, error } = await resend.emails.send({
      from,
      to,
      subject: "ECKCM - Test Email",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #0f172a;">ECKCM Test Email</h1>
          <p>This is a test email from your ECKCM system.</p>
          <p>If you received this email, your email configuration is working correctly.</p>
          <p style="color: #6b7280; font-size: 13px;">Sent from: <code>${from}</code></p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">
            Sent at ${new Date().toISOString()}
          </p>
        </div>
      `,
    });

    if (!error) {
      await logEmail({
        toEmail: to,
        fromEmail: from,
        subject: "ECKCM - Test Email",
        template: "test",
        status: "sent",
        resendId: sendResult?.id,
        sentBy: user.id,
      });
      return NextResponse.json({ success: true, from });
    }

    console.error(`[email/test] Failed with from=${from}:`, error);
    lastError = error;

    // If it's a domain verification error, try the next from address
    if (error.message?.includes("not verified")) continue;
    // For other errors, don't retry
    break;
  }

  await logEmail({
    toEmail: to,
    fromEmail: emailConfig.from,
    subject: "ECKCM - Test Email",
    template: "test",
    status: "failed",
    errorMessage: String(lastError),
    sentBy: user.id,
  });

  console.error("[email/test] All from addresses failed:", lastError);
  return NextResponse.json({ error: "Failed to send email. Domain may not be verified in Resend." }, { status: 500 });
}
