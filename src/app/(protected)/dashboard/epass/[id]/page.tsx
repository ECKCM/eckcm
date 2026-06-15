import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signParticipantCode } from "@/lib/services/epass.service";
import {
  hasMembershipInRegistration,
  resolveParticipantCode,
} from "@/lib/services/participant-code.service";
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

  // Get E-Pass token with person and registration info
  const { data: token } = await supabase
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

  // Verify this user owns this E-Pass (via registration creator)
  const reg = (token as any).eckcm_registrations;
  if (reg?.created_by_user_id !== user.id) {
    notFound();
  }

  const admin = createAdminClient();
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
