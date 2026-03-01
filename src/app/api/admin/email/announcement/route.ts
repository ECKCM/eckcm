import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { logger } from "@/lib/logger";
import { z } from "zod";

const schema = z.object({
  eventId: z.string().uuid(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(50000),
  testOnly: z.boolean().optional(),
});

function buildAnnouncementEmail(subject: string, body: string, eventName: string): string {
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
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 8px 8px 0 0; padding: 24px; text-align: center;">
          <tr>
            <td>
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">ECKCM</h1>
              <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">${eventName}</p>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 32px; border: 1px solid #e5e7eb;">
          <tr>
            <td>
              <h2 style="font-size: 20px; color: #111827; margin: 0 0 16px;">${subject}</h2>
              <div style="font-size: 15px; color: #374151; line-height: 1.6;">
                ${body}
              </div>
            </td>
          </tr>
        </table>
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

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const adminUserId = auth.user.id;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { eventId, subject, body, testOnly } = parsed.data;
  const admin = createAdminClient();

  // Load event name
  const { data: event } = await admin
    .from("eckcm_events")
    .select("name_en")
    .eq("id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const emailConfig = await getEmailConfig();
  const html = buildAnnouncementEmail(subject, body, event.name_en);

  // Test mode: send only to admin's own email
  if (testOnly) {
    const adminEmail = auth.user.email;
    if (!adminEmail) {
      return NextResponse.json({ error: "No admin email" }, { status: 400 });
    }

    try {
      const resend = await getResendClient();
      const { data: sendResult, error } = await resend.emails.send({
        from: emailConfig.from,
        to: adminEmail,
        ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
        subject: `[TEST] ${subject}`,
        html,
      });

      if (error) {
        return NextResponse.json({ error: "Failed to send test email" }, { status: 500 });
      }

      await logEmail({
        eventId,
        toEmail: adminEmail,
        fromEmail: emailConfig.from,
        subject: `[TEST] ${subject}`,
        template: "announcement",
        status: "sent",
        resendId: sendResult?.id,
        sentBy: adminUserId,
      });

      return NextResponse.json({ success: true, sentCount: 1, testOnly: true });
    } catch (error) {
      logger.error("[admin/email/announcement] Test send failed", { error: String(error) });
      return NextResponse.json({ error: "Failed to send test email" }, { status: 500 });
    }
  }

  // Bulk send: get all unique registrant emails for the event
  const { data: registrations } = await admin
    .from("eckcm_registrations")
    .select("id, created_by_user_id")
    .eq("event_id", eventId)
    .in("status", ["PAID", "SUBMITTED"]);

  if (!registrations || registrations.length === 0) {
    return NextResponse.json({ error: "No registrations found for this event" }, { status: 404 });
  }

  // Batch fetch all user emails in parallel (instead of N+1 sequential lookups)
  const userIds = [...new Set(registrations.map((r) => r.created_by_user_id))];
  const userResults = await Promise.all(
    userIds.map((id) => admin.auth.admin.getUserById(id))
  );
  const uniqueEmails = [...new Set(
    userResults
      .map((r) => r.data?.user?.email)
      .filter((e): e is string => !!e)
  )];

  if (uniqueEmails.length === 0) {
    return NextResponse.json({ error: "No valid email addresses found" }, { status: 404 });
  }

  // Send emails with concurrency control (5 at a time to avoid rate limits)
  const CONCURRENCY = 5;
  const resend = await getResendClient();
  let sentCount = 0;
  let failCount = 0;

  async function sendOne(email: string) {
    try {
      const { data: sendResult, error } = await resend.emails.send({
        from: emailConfig.from,
        to: email,
        ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
        subject,
        html,
      });

      if (error) {
        failCount++;
        await logEmail({
          eventId,
          toEmail: email,
          fromEmail: emailConfig.from,
          subject,
          template: "announcement",
          status: "failed",
          errorMessage: error.message,
          sentBy: adminUserId,
        });
      } else {
        sentCount++;
        await logEmail({
          eventId,
          toEmail: email,
          fromEmail: emailConfig.from,
          subject,
          template: "announcement",
          status: "sent",
          resendId: sendResult?.id,
          sentBy: adminUserId,
        });
      }
    } catch {
      failCount++;
    }
  }

  // Process in batches of CONCURRENCY
  for (let i = 0; i < uniqueEmails.length; i += CONCURRENCY) {
    const batch = uniqueEmails.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(sendOne));
  }

  logger.info("[admin/email/announcement] Bulk send complete", { sentCount, failCount, total: uniqueEmails.length });

  return NextResponse.json({
    success: true,
    sentCount,
    failCount,
    total: uniqueEmails.length,
  });
}
