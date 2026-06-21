import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signParticipantCode } from "@/lib/services/epass.service";
import {
  hasMembershipInRegistration,
  resolveParticipantCode,
} from "@/lib/services/participant-code.service";
import {
  getEPassVisibility,
  isTokenVisible,
} from "@/lib/services/epass-visibility.service";
import { EPassDetail } from "./epass-detail";

export default async function EPassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Get E-Pass token with person and registration info.
  //
  // Use the ADMIN client: the RLS policy "Users read own epass" only exposes a
  // token when its registration.created_by_user_id = auth.uid(), so a
  // transferred-in pass (which lives in another user's registration) would
  // return null here and 404 even though the user is allowed to view it. Access
  // is enforced below by the visibility check instead — own registrations plus
  // the specific (person, registration) pairs reached via a transfer — which is
  // strictly more precise than the created_by RLS rule. Consistent with the
  // membership/code
  // reads further down, which already use admin.
  const { data: token } = await admin
    .from("eckcm_epass_tokens")
    .select(`
      id,
      token,
      is_active,
      created_at,
      person_id,
      registration_id,
      eckcm_people!inner(first_name_en, last_name_en, display_name_ko, gender, birth_date, church_other, eckcm_churches(name_en)),
      eckcm_registrations!inner(
        confirmation_code,
        status,
        start_date,
        end_date,
        event_id,
        created_by_user_id,
        eckcm_events!inner(name_en, name_ko, year, location)
      )
    `)
    .eq("id", id)
    .single();

  if (!token) notFound();

  // Verify this user may see this E-Pass. Not just "did I create its
  // registration" — a participant they registered may have been transferred to
  // another registration, so we also allow the exact (person, registration)
  // pair reached via a transfer. We check the SPECIFIC pair (not just the
  // registration) so a direct-URL visit can't reach an unrelated person who
  // merely shares a transfer-target registration. Matches the list view.
  const visibility = await getEPassVisibility(admin, user.id);
  if (
    !isTokenVisible(
      visibility,
      (token as any).person_id,
      (token as any).registration_id,
    )
  ) {
    notFound();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = token as any;

  // A membership is the source of truth for belonging to the registration. If
  // it's gone the person was transferred away (clone model) and this is a stale
  // ghost token — don't render a broken pass for it. The list view already
  // hides these; this guards direct-URL access by id.
  const stillBelongs = await hasMembershipInRegistration(
    admin,
    t.person_id,
    t.registration_id,
  );
  if (!stillBelongs) notFound();

  // Resolve participant_code robustly: tolerates duplicate membership rows
  // and self-heals NULL codes so the QR never silently disappears.
  const participantCode = await resolveParticipantCode(
    admin,
    t.person_id,
    t.registration_id,
  );

  // Sign participant code with HMAC if secret is configured
  let qrValue = participantCode;
  if (participantCode) {
    const { data: config } = await admin
      .from("eckcm_app_config")
      .select("epass_hmac_secret")
      .eq("id", 1)
      .single();
    const secret = (config as any)?.epass_hmac_secret as string | null;
    if (secret) {
      qrValue = signParticipantCode(participantCode, secret);
    }
  }

  return (
    <EPassDetail
      token={{
        token: t.token,
        is_active: t.is_active,
        participant_code: participantCode,
        qr_value: qrValue,
        eckcm_people: t.eckcm_people,
        eckcm_registrations: t.eckcm_registrations,
      }}
    />
  );
}
