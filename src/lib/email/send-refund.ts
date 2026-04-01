import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig, getEmailHeaders } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { buildRefundEmail } from "@/lib/email/templates/refund";
import { logger } from "@/lib/logger";

interface SendRefundEmailParams {
  registrationId: string;
  refundAmountCents: number;
  reason: string;
  isFullRefund: boolean;
  paymentMethod?: string | null;
  sentBy?: string | null;
}

/**
 * Send refund notification email to registrant (and participant emails).
 * Non-blocking — errors are logged but don't throw.
 */
export async function sendRefundEmail(params: SendRefundEmailParams): Promise<void> {
  const {
    registrationId,
    refundAmountCents,
    reason,
    isFullRefund,
    paymentMethod,
    sentBy,
  } = params;

  try {
    const admin = createAdminClient();

    // Load registration + event info
    const { data: reg } = await admin
      .from("eckcm_registrations")
      .select(
        `id, confirmation_code, total_amount_cents, start_date, end_date,
         created_by_user_id, event_id,
         eckcm_events!inner(name_en, location, event_start_date, event_end_date)`
      )
      .eq("id", registrationId)
      .single();

    if (!reg) {
      logger.error(`[sendRefundEmail] Registration not found: ${registrationId}`);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const regData = reg as any;

    // Load user email + participant emails + email config + resend client in parallel
    const [userResult, membershipsResult, emailConfig, resend] = await Promise.all([
      admin.auth.admin.getUserById(regData.created_by_user_id),
      admin
        .from("eckcm_group_memberships")
        .select("eckcm_people!inner(email), eckcm_groups!inner(registration_id)")
        .eq("eckcm_groups.registration_id", registrationId),
      getEmailConfig(),
      getResendClient(),
    ]);

    const user = userResult.data?.user;
    if (!user?.email) {
      logger.error(`[sendRefundEmail] No email for user: ${regData.created_by_user_id}`);
      return;
    }

    const fmtCents = (c: number) => `$${(c / 100).toFixed(2)}`;
    const remainingCents = regData.total_amount_cents;
    const originalAmountCents = remainingCents + refundAmountCents;

    // Determine payment method label for email
    let methodLabel = "STRIPE";
    if (paymentMethod === "ZELLE") methodLabel = "ZELLE";
    else if (paymentMethod === "CHECK") methodLabel = "CHECK";
    else if (paymentMethod === "MANUAL") methodLabel = "MANUAL";

    const html = buildRefundEmail({
      confirmationCode: regData.confirmation_code,
      eventName: regData.eckcm_events.name_en,
      eventLocation: regData.eckcm_events.location || "TBD",
      eventDates: `${regData.start_date} ~ ${regData.end_date}`,
      refundAmountFormatted: fmtCents(refundAmountCents),
      originalAmountFormatted: fmtCents(originalAmountCents),
      remainingBalanceFormatted: isFullRefund ? null : fmtCents(remainingCents),
      reason,
      paymentMethod: methodLabel,
      refundDate: new Date().toLocaleDateString("en-US"),
    });

    const subject = isFullRefund
      ? `ECKCM Refund Processed - ${regData.confirmation_code}`
      : `ECKCM Partial Refund Processed - ${regData.confirmation_code}`;

    // Plain text fallback
    const text = [
      isFullRefund
        ? "Your registration has been fully refunded."
        : "A partial refund has been issued for your registration.",
      "",
      `Confirmation Code: ${regData.confirmation_code}`,
      "",
      "Event Details:",
      `  Event: ${regData.eckcm_events.name_en}`,
      `  Location: ${regData.eckcm_events.location || "TBD"}`,
      `  Dates: ${regData.start_date} ~ ${regData.end_date}`,
      "",
      "Refund Details:",
      `  Refund Amount: ${fmtCents(refundAmountCents)}`,
      `  Original Amount: ${fmtCents(originalAmountCents)}`,
      ...(isFullRefund ? [] : [`  Remaining Balance/Stripe Processing Fee: ${fmtCents(remainingCents)}`]),
      `  Reason: ${reason}`,
      `  Date: ${new Date().toLocaleDateString("en-US")}`,
      "",
      "If you have any questions about this refund, please contact us.",
      "",
      "East Coast Korean Camp Meeting",
    ].join("\n");

    // Collect recipient emails (registrant + participants)
    const toAddresses = new Set<string>([user.email]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of (membershipsResult.data ?? []) as any[]) {
      const email = m.eckcm_people?.email;
      if (email && email.toLowerCase() !== user.email!.toLowerCase()) {
        toAddresses.add(email.toLowerCase());
      }
    }

    const recipients = [...toAddresses];

    const { data: sendResult, error } = await resend.emails.send({
      from: emailConfig.from,
      to: recipients,
      ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
      subject,
      html,
      text,
      headers: getEmailHeaders(),
    });

    const toEmailLog = recipients.join(", ");
    if (error) {
      logger.error("[sendRefundEmail] Resend error", { error: error.message });
      await logEmail({
        eventId: regData.event_id,
        toEmail: toEmailLog,
        fromEmail: emailConfig.from,
        subject,
        template: "refund",
        registrationId,
        status: "failed",
        errorMessage: error.message,
        sentBy: sentBy ?? null,
      });
    } else {
      logger.info(`[sendRefundEmail] Email sent to ${toEmailLog} for registration ${registrationId}`);
      await logEmail({
        eventId: regData.event_id,
        toEmail: toEmailLog,
        fromEmail: emailConfig.from,
        subject,
        template: "refund",
        registrationId,
        status: "sent",
        resendId: sendResult?.id,
        sentBy: sentBy ?? null,
      });
    }
  } catch (err) {
    logger.error("[sendRefundEmail] Unexpected error", { error: String(err) });
  }
}
