import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig, getEmailHeaders } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { buildEPassEmail } from "@/lib/email/templates/epass";
import { ensureEPassTokens, buildEPassUrl } from "@/lib/email/epass-link";

/**
 * Resend per-participant ePass emails for a registration.
 *
 * Sends one email per participant who has an email address; participants
 * without an email are skipped (they can use the registrant's account).
 * If no participant has an email, falls back to the registrant with a
 * consolidated link to the dashboard.
 *
 * Returns counts so the caller can surface a meaningful toast.
 *
 * Pass `toOverride` to send every participant's ePass to a single custom
 * address instead of each participant's own email (admin "Resend to a custom
 * email"). When set, no participant is skipped for a missing email.
 */
export async function sendEPassEmails(
  registrationId: string,
  sentBy?: string | null,
  toOverride?: string | null,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const admin = createAdminClient();

  const [regResult, membershipsResult] = await Promise.all([
    admin
      .from("eckcm_registrations")
      .select(
        `id, confirmation_code, start_date, end_date, event_id, created_by_user_id,
         eckcm_events!inner(name_en)`,
      )
      .eq("id", registrationId)
      .single(),
    admin
      .from("eckcm_group_memberships")
      .select(
        `person_id,
         eckcm_people!inner(first_name_en, last_name_en, display_name_ko, email),
         eckcm_groups!inner(registration_id)`,
      )
      .eq("eckcm_groups.registration_id", registrationId),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reg = regResult.data as any;
  if (!reg) {
    console.error(`[sendEPassEmails] Registration not found: ${registrationId}`);
    return { sent: 0, skipped: 0, failed: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memberships = (membershipsResult.data ?? []) as any[];

  // Guarantee a token for every participant so each email links straight to the
  // public /epass page (viewable without login) instead of /dashboard/epass.
  const tokenMap = await ensureEPassTokens(
    admin,
    registrationId,
    memberships.map((m) => m.person_id),
  );

  const [emailConfig, resend] = await Promise.all([getEmailConfig(), getResendClient()]);

  const baseUrl = process.env.APP_URL || "https://my.eckcm.com";
  const eventName = reg.eckcm_events?.name_en ?? "ECKCM";
  const eventDates = `${reg.start_date} ~ ${reg.end_date}`;

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const m of memberships) {
    const person = m.eckcm_people;
    const recipient = toOverride || person.email;
    if (!recipient) {
      skipped++;
      continue;
    }
    const epassUrl = buildEPassUrl(
      baseUrl,
      person.first_name_en,
      person.last_name_en,
      tokenMap.get(m.person_id),
    );

    const personName = `${person.first_name_en} ${person.last_name_en}`;
    const html = buildEPassEmail({
      personName,
      koreanName: person.display_name_ko,
      eventName,
      eventDates,
      epassUrl,
      confirmationCode: reg.confirmation_code,
    });
    const subject = `Your ECKCM E-Pass — ${reg.confirmation_code}`;

    const { data: sendResult, error } = await resend.emails.send({
      from: emailConfig.from,
      to: [recipient],
      ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
      subject,
      html,
      headers: getEmailHeaders(),
    });

    if (error) {
      failed++;
      console.error(`[sendEPassEmails] Send error for ${recipient}:`, error);
      await logEmail({
        eventId: reg.event_id,
        toEmail: recipient,
        fromEmail: emailConfig.from,
        subject,
        template: "epass",
        registrationId,
        status: "failed",
        errorMessage: error.message,
        sentBy: sentBy ?? null,
      });
    } else {
      sent++;
      await logEmail({
        eventId: reg.event_id,
        toEmail: recipient,
        fromEmail: emailConfig.from,
        subject,
        template: "epass",
        registrationId,
        status: "sent",
        resendId: sendResult?.id,
        sentBy: sentBy ?? null,
      });
    }
  }

  return { sent, skipped, failed };
}
