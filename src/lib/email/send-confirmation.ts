import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { buildConfirmationEmail } from "@/lib/email/templates/confirmation";

export async function sendConfirmationEmail(
  registrationId: string,
  sentBy?: string | null,
  options?: { paymentMethod?: string }
): Promise<void> {
  const admin = createAdminClient();

  // 1. Load registration, memberships, tokens, and payment in parallel
  const [regResult, membershipsResult, tokensResult, paymentResult] = await Promise.all([
    admin
      .from("eckcm_registrations")
      .select(
        `
        id,
        confirmation_code,
        total_amount_cents,
        start_date,
        end_date,
        created_by_user_id,
        event_id,
        status,
        eckcm_events!inner(name_en, location, event_start_date, event_end_date)
      `
      )
      .eq("id", registrationId)
      .single(),
    admin
      .from("eckcm_group_memberships")
      .select(
        `
        person_id,
        eckcm_people!inner(first_name_en, last_name_en, display_name_ko, phone),
        eckcm_groups!inner(registration_id)
      `
      )
      .eq("eckcm_groups.registration_id", registrationId),
    admin
      .from("eckcm_epass_tokens")
      .select("person_id, token")
      .eq("registration_id", registrationId)
      .eq("is_active", true),
    admin
      .from("eckcm_invoices")
      .select("eckcm_payments(payment_method)")
      .eq("registration_id", registrationId)
      .limit(1)
      .maybeSingle(),
  ]);

  const registration = regResult.data;
  if (!registration) {
    console.error(
      `[sendConfirmationEmail] Registration not found: ${registrationId}`
    );
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reg = registration as any;

  // 2. Fetch user email + email config + resend client in parallel
  const [userResult, emailConfig, resend] = await Promise.all([
    admin.auth.admin.getUserById(reg.created_by_user_id),
    getEmailConfig(),
    getResendClient(),
  ]);

  const user = userResult.data?.user;
  if (!user?.email) {
    console.error(
      `[sendConfirmationEmail] No email for user: ${reg.created_by_user_id}`
    );
    return;
  }

  const tokenMap = new Map(
    (tokensResult.data ?? []).map((t) => [t.person_id, t.token])
  );

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://my.eckcm.com";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const participants = (membershipsResult.data ?? []).map((m: any) => {
    const person = m.eckcm_people;
    const name =
      person.display_name_ko ||
      `${person.first_name_en} ${person.last_name_en}`;
    const token = tokenMap.get(m.person_id);
    // Build slug with name prefix so extractTokenFromSlug works correctly
    // (tokens can contain underscores from base64url encoding)
    const slug = token
      ? `${person.first_name_en}${person.last_name_en}`.replace(/[^a-zA-Z0-9]/g, "") + `_${token}`
      : null;
    return {
      name,
      epassUrl: slug ? `${baseUrl}/epass/${slug}` : `${baseUrl}/dashboard/epass`,
    };
  });

  const eventDates = `${reg.start_date} ~ ${reg.end_date}`;
  const totalAmount = `$${(reg.total_amount_cents / 100).toFixed(2)}`;

  // Detect payment method: prefer explicit option, then DB lookup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentData = paymentResult.data as any;
  const paymentMethod =
    options?.paymentMethod ||
    (paymentData?.eckcm_payments?.[0]?.payment_method as string | undefined) ||
    null;

  const isZelle = paymentMethod === "ZELLE";

  // Build Zelle info for manual payment emails
  // Get the first member's phone for memo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstMember = (membershipsResult.data ?? [])[0] as any;
  const registrantPhone = firstMember?.eckcm_people?.phone?.replace(/\D/g, "") || "";
  const zelleInfo = isZelle
    ? {
        zelleEmail: "kimdani1@icloud.com",
        accountHolder: "EMPOWER MINISTRY GROUP, INC",
        memo: `${reg.confirmation_code} - ${participants[0]?.name || "N/A"} - ${registrantPhone} - ${user.email}`,
      }
    : null;

  const html = buildConfirmationEmail({
    confirmationCode: reg.confirmation_code,
    eventName: reg.eckcm_events.name_en,
    eventLocation: reg.eckcm_events.location || "TBD",
    eventDates,
    participants,
    totalAmount,
    paymentMethod,
    zelleInfo,
  });
  const subject = isZelle
    ? `ECKCM Registration Submitted - ${reg.confirmation_code}`
    : `ECKCM Registration Confirmed - ${reg.confirmation_code}`;

  const { data: sendResult, error } = await resend.emails.send({
    from: emailConfig.from,
    to: user.email,
    ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
    subject,
    html,
  });

  if (error) {
    console.error("[sendConfirmationEmail] Resend error:", error);
    await logEmail({
      eventId: reg.event_id,
      toEmail: user.email,
      fromEmail: emailConfig.from,
      subject,
      template: "confirmation",
      registrationId,
      status: "failed",
      errorMessage: error.message,
      sentBy: sentBy ?? null,
    });
  } else {
    console.log(
      `[sendConfirmationEmail] Email sent to ${user.email} for registration ${registrationId}`
    );
    await logEmail({
      eventId: reg.event_id,
      toEmail: user.email,
      fromEmail: emailConfig.from,
      subject,
      template: "confirmation",
      registrationId,
      status: "sent",
      resendId: sendResult?.id,
      sentBy: sentBy ?? null,
    });
  }
}
