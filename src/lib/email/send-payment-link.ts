import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig, getEmailHeaders } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { buildPaymentLinkEmail } from "@/lib/email/templates/payment-link";
import { ensurePaymentLinkToken } from "@/lib/payment/payment-link";

/**
 * Email a SUBMITTED registrant a self-service card-payment link.
 *
 * Reuses the existing link if one was already generated (so the registrant
 * always gets the same URL). Throws if the registration is not SUBMITTED or has
 * no email on file, so the caller can surface a meaningful error.
 *
 * Returns the address it was sent to.
 *
 * Pass `toOverride` to send to a custom address instead of the registrant's
 * email on file (admin "Resend to a custom email").
 */
export async function sendPaymentLinkEmail(
  registrationId: string,
  sentBy?: string | null,
  toOverride?: string | null
): Promise<{ to: string }> {
  // Generate (or reuse) the token first — also validates SUBMITTED status.
  const link = await ensurePaymentLinkToken(registrationId);
  if (!link.ok) {
    throw new Error(link.error);
  }

  const admin = createAdminClient();
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select(
      `id, confirmation_code, start_date, end_date, event_id, created_by_user_id,
       eckcm_events!inner(name_en)`
    )
    .eq("id", registrationId)
    .single();

  if (!reg) {
    throw new Error("Registration not found");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = reg as any;

  const { data: userData } = await admin.auth.admin.getUserById(
    r.created_by_user_id
  );
  const toEmail = toOverride || userData?.user?.email;
  if (!toEmail) {
    throw new Error("No email on file for this registrant");
  }

  const [emailConfig, resend] = await Promise.all([
    getEmailConfig(),
    getResendClient(),
  ]);

  const html = buildPaymentLinkEmail({
    eventName: r.eckcm_events?.name_en ?? "ECKCM",
    eventDates: `${r.start_date} ~ ${r.end_date}`,
    confirmationCode: r.confirmation_code,
    payUrl: link.url,
  });
  const subject = `Complete Your ECKCM Payment — ${r.confirmation_code}`;

  const { data: sendResult, error } = await resend.emails.send({
    from: emailConfig.from,
    to: [toEmail],
    ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
    subject,
    html,
    headers: getEmailHeaders(),
  });

  if (error) {
    console.error("[sendPaymentLinkEmail] Resend error:", error);
    await logEmail({
      eventId: r.event_id,
      toEmail,
      fromEmail: emailConfig.from,
      subject,
      template: "payment_link",
      registrationId,
      status: "failed",
      errorMessage: error.message,
      sentBy: sentBy ?? null,
    });
    throw new Error(error.message || "Failed to send payment link email");
  }

  await logEmail({
    eventId: r.event_id,
    toEmail,
    fromEmail: emailConfig.from,
    subject,
    template: "payment_link",
    registrationId,
    status: "sent",
    resendId: sendResult?.id,
    sentBy: sentBy ?? null,
  });

  return { to: toEmail };
}
