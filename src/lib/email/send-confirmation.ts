import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { buildConfirmationEmail } from "@/lib/email/templates/confirmation";

const FROM_EMAIL =
  process.env.EMAIL_FROM || "ECKCM <noreply@eckcm.org>";

export async function sendConfirmationEmail(
  registrationId: string
): Promise<void> {
  const admin = createAdminClient();

  // 1. Load registration with event info
  const { data: registration } = await admin
    .from("eckcm_registrations")
    .select(
      `
      id,
      confirmation_code,
      total_amount_cents,
      start_date,
      end_date,
      created_by_user_id,
      eckcm_events!inner(name_en, location, event_start_date, event_end_date)
    `
    )
    .eq("id", registrationId)
    .single();

  if (!registration) {
    console.error(
      `[sendConfirmationEmail] Registration not found: ${registrationId}`
    );
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reg = registration as any;

  // 2. Get representative's email from auth.users
  const {
    data: { user },
  } = await admin.auth.admin.getUserById(reg.created_by_user_id);

  if (!user?.email) {
    console.error(
      `[sendConfirmationEmail] No email for user: ${reg.created_by_user_id}`
    );
    return;
  }

  // 3. Load participants with E-Pass tokens
  const { data: memberships } = await admin
    .from("eckcm_group_memberships")
    .select(
      `
      person_id,
      eckcm_people!inner(first_name_en, last_name_en, display_name_ko),
      eckcm_groups!inner(registration_id)
    `
    )
    .eq("eckcm_groups.registration_id", registrationId);

  // 4. Load E-Pass tokens for this registration
  const { data: tokens } = await admin
    .from("eckcm_epass_tokens")
    .select("person_id, token")
    .eq("registration_id", registrationId)
    .eq("is_active", true);

  const tokenMap = new Map(
    (tokens ?? []).map((t) => [t.person_id, t.token])
  );

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://eckcm.org";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const participants = (memberships ?? []).map((m: any) => {
    const person = m.eckcm_people;
    const name =
      person.display_name_ko ||
      `${person.first_name_en} ${person.last_name_en}`;
    const token = tokenMap.get(m.person_id);
    return {
      name,
      epassUrl: token ? `${baseUrl}/epass/${token}` : `${baseUrl}/dashboard/epass`,
    };
  });

  const eventDates = `${reg.start_date} ~ ${reg.end_date}`;
  const totalAmount = `$${(reg.total_amount_cents / 100).toFixed(2)}`;

  const html = buildConfirmationEmail({
    confirmationCode: reg.confirmation_code,
    eventName: reg.eckcm_events.name_en,
    eventLocation: reg.eckcm_events.location || "TBD",
    eventDates,
    participants,
    totalAmount,
  });

  // 5. Send via Resend
  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: user.email,
    subject: `ECKCM Registration Confirmed - ${reg.confirmation_code}`,
    html,
  });

  if (error) {
    console.error("[sendConfirmationEmail] Resend error:", error);
  } else {
    console.log(
      `[sendConfirmationEmail] Email sent to ${user.email} for registration ${registrationId}`
    );
  }
}
