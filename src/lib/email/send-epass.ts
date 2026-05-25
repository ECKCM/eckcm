import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig, getEmailHeaders } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { buildEPassEmail } from "@/lib/email/templates/epass";

/**
 * Resend per-participant ePass emails for a registration.
 *
 * Sends one email per participant who has an email address; participants
 * without an email are skipped (they can use the registrant's account).
 * If no participant has an email, falls back to the registrant with a
 * consolidated link to the dashboard.
 *
 * Returns counts so the caller can surface a meaningful toast.
 */
export async function sendEPassEmails(
  registrationId: string,
  sentBy?: string | null,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const admin = createAdminClient();

  const [regResult, membershipsResult, tokensResult] = await Promise.all([
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
    admin
      .from("eckcm_epass_tokens")
      .select("person_id, token")
      .eq("registration_id", registrationId)
      .eq("is_active", true),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reg = regResult.data as any;
  if (!reg) {
    console.error(`[sendEPassEmails] Registration not found: ${registrationId}`);
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const tokenMap = new Map<string, string>();
  (tokensResult.data ?? []).forEach((t) => tokenMap.set(t.person_id, t.token));

  const [emailConfig, resend] = await Promise.all([getEmailConfig(), getResendClient()]);

  const baseUrl = process.env.APP_URL || "https://my.eckcm.com";
  const eventName = reg.eckcm_events?.name_en ?? "ECKCM";
  const eventDates = `${reg.start_date} ~ ${reg.end_date}`;

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (membershipsResult.data ?? []) as any[]) {
    const person = m.eckcm_people;
    if (!person.email) {
      skipped++;
      continue;
    }
    const token = tokenMap.get(m.person_id);
    const slug = token
      ? `${person.first_name_en}${person.last_name_en}`.replace(/[^a-zA-Z0-9]/g, "") + `_${token}`
      : null;
    const epassUrl = slug ? `${baseUrl}/epass/${slug}` : `${baseUrl}/dashboard/epass`;

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
      to: [person.email],
      ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
      subject,
      html,
      headers: getEmailHeaders(),
    });

    if (error) {
      failed++;
      console.error(`[sendEPassEmails] Send error for ${person.email}:`, error);
      await logEmail({
        eventId: reg.event_id,
        toEmail: person.email,
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
        toEmail: person.email,
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
