import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig, getBulkEmailHeaders } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { resolveParticipantEmails } from "@/lib/email/recipients";
import { sanitizeEmailHtml, htmlToPlainText } from "@/lib/email/sanitize";
import { buildAnnouncementHtml } from "@/lib/email/templates/announcement";
import { logger } from "@/lib/logger";

const schema = z.object({
  eventId: z.string().uuid(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(50000),
  departmentIds: z.array(z.string().uuid()).max(50).optional().default([]),
  testOnly: z.boolean().optional().default(false),
});

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

  const { eventId, subject, body, departmentIds, testOnly } = parsed.data;
  const admin = createAdminClient();

  const { data: event } = await admin
    .from("eckcm_events")
    .select("name_en")
    .eq("id", eventId)
    .single();
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const cleanBody = sanitizeEmailHtml(body);
  if (!cleanBody.trim()) {
    return NextResponse.json(
      { error: "Body is empty after sanitization" },
      { status: 400 }
    );
  }

  const emailConfig = await getEmailConfig();
  const unsubscribeEmail = emailConfig.replyTo || "contact@eckcm.com";
  const html = buildAnnouncementHtml({
    subject,
    bodyHtml: cleanBody,
    eventName: event.name_en,
    unsubscribeEmail,
  });
  const text = htmlToPlainText(html);
  const headers = getBulkEmailHeaders(emailConfig.replyTo);

  const resend = await getResendClient();

  if (testOnly) {
    const adminEmail = auth.user.email;
    if (!adminEmail) {
      return NextResponse.json({ error: "No admin email" }, { status: 400 });
    }

    try {
      const { data: sendResult, error } = await resend.emails.send({
        from: emailConfig.from,
        to: adminEmail,
        ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
        subject: `[TEST] ${subject}`,
        html,
        text,
        headers,
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

  let recipientEmails: string[];
  try {
    recipientEmails = await resolveParticipantEmails({
      admin,
      eventId,
      departmentIds,
    });
  } catch (error) {
    logger.error("[admin/email/announcement] Recipient resolve failed", { error: String(error) });
    return NextResponse.json({ error: "Failed to resolve recipients" }, { status: 500 });
  }

  if (recipientEmails.length === 0) {
    return NextResponse.json(
      { error: "No participants match the selected filter" },
      { status: 404 }
    );
  }

  // Send in small concurrent batches so we stay well under Resend's per-second
  // rate limit and give downstream MTAs (Gmail, Outlook) a steadier ramp than
  // firing every message at once.
  const CONCURRENCY = 5;
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
        text,
        headers,
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
    } catch (err) {
      failCount++;
      logger.error("[admin/email/announcement] Send threw", { error: String(err), email });
    }
  }

  for (let i = 0; i < recipientEmails.length; i += CONCURRENCY) {
    const batch = recipientEmails.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(sendOne));
  }

  logger.info("[admin/email/announcement] Bulk send complete", {
    sentCount,
    failCount,
    total: recipientEmails.length,
    departmentIds: departmentIds.length > 0 ? departmentIds : "ALL",
  });

  return NextResponse.json({
    success: true,
    sentCount,
    failCount,
    total: recipientEmails.length,
  });
}
