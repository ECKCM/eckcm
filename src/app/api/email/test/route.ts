import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/email/resend";
import { requireAdmin } from "@/lib/auth/admin";

const FROM_EMAIL =
  process.env.EMAIL_FROM || "ECKCM <noreply@my.eckcm.com>";

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

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "ECKCM - Test Email",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #0f172a;">ECKCM Test Email</h1>
        <p>This is a test email from your ECKCM system.</p>
        <p>If you received this email, your email configuration is working correctly.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">
          Sent at ${new Date().toISOString()}
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[email/test] Resend error:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
