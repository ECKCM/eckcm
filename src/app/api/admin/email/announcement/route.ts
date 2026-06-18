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
  registrationGroupIds: z.array(z.string().uuid()).max(50).optional().default([]),
  testOnly: z.boolean().optional().default(false),
  // When testOnly, send to these addresses instead of the admin's own. Empty
  // falls back to the logged-in admin's email.
  testEmails: z.array(z.string().trim().email()).max(10).optional().default([]),
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

  const { eventId, subject, body, departmentIds, registrationGroupIds, testOnly, testEmails } =
    parsed.data;

  try {
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

  // Brand-prefix every announcement so the recipient instantly recognises
  // the sender in their inbox list. Skip the prefix if the admin already
  // typed one themselves (e.g. they pasted "[ECKCM]" or "[Reminder]" into
  // the subject field) so we don't double up.
  const PREFIX = "[ECKCM]";
  const subjectWithBrand = subject.trim().startsWith("[")
    ? subject
    : `${PREFIX} ${subject}`;

  const resend = await getResendClient();

  if (testOnly) {
    // Dedupe + lowercase the custom addresses; fall back to the admin's own
    // email when none were supplied so "Send test to me" keeps working.
    const customTargets = Array.from(
      new Set(testEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))
    );
    const targets =
      customTargets.length > 0
        ? customTargets
        : auth.user.email
          ? [auth.user.email.toLowerCase()]
          : [];

    if (targets.length === 0) {
      return NextResponse.json({ error: "No test recipient address" }, { status: 400 });
    }

    let testSent = 0;
    let testFailed = 0;
    let lastError: string | null = null;
    for (const target of targets) {
      try {
        const { data: sendResult, error } = await resend.emails.send({
          from: emailConfig.from,
          to: target,
          ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
          subject: subjectWithBrand,
          html,
          text,
          headers,
        });

        if (error) {
          testFailed++;
          lastError = error.message;
          logger.error("[admin/email/announcement] Resend rejected test", {
            error: error.message,
            name: (error as { name?: string }).name,
            from: emailConfig.from,
            target,
          });
          continue;
        }

        testSent++;
        await logEmail({
          eventId,
          toEmail: target,
          fromEmail: emailConfig.from,
          subject: subjectWithBrand,
          template: "announcement",
          status: "sent",
          resendId: sendResult?.id,
          sentBy: adminUserId,
        });
      } catch (error) {
        testFailed++;
        lastError = error instanceof Error ? error.message : String(error);
        logger.error("[admin/email/announcement] Test send failed", {
          error: String(error),
          target,
        });
      }
    }

    if (testSent === 0) {
      return NextResponse.json(
        { error: `Failed to send test email${lastError ? `: ${lastError}` : ""}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sentCount: testSent,
      failCount: testFailed,
      testOnly: true,
    });
  }

  let recipientEmails: string[];
  try {
    recipientEmails = await resolveParticipantEmails({
      admin,
      eventId,
      departmentIds,
      registrationGroupIds,
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
        subject: subjectWithBrand,
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
          subject: subjectWithBrand,
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
          subject: subjectWithBrand,
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
  } catch (error) {
    // Anything thrown before the inner handlers (e.g. getResendClient() when
    // no API key is configured) would otherwise bubble up as a bare Next.js
    // 500 HTML page with no clue. Surface the real reason instead.
    const message = error instanceof Error ? error.message : String(error);
    logger.error("[admin/email/announcement] Unhandled failure", { error: message });
    return NextResponse.json(
      { error: `Announcement failed: ${message}` },
      { status: 500 }
    );
  }
}
