import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "crypto";
import { notFound } from "next/navigation";
import { EPassViewer } from "./epass-viewer";
import { signParticipantCode } from "@/lib/services/epass.service";

/**
 * Parse slug format: "FirstNameLastName_<token>" or plain "<token>"
 * Names are alphanumeric only (no underscores), so first "_" is the separator.
 */
function extractTokenFromSlug(slug: string): string {
  const separatorIdx = slug.indexOf("_");
  if (separatorIdx !== -1) {
    return slug.substring(separatorIdx + 1);
  }
  return slug;
}

export default async function EPassPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: slug } = await params;
  const token = extractTokenFromSlug(decodeURIComponent(slug));
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const admin = createAdminClient();

  const { data: epass } = await admin
    .from("eckcm_epass_tokens")
    .select(
      `
      id,
      token_hash,
      is_active,
      created_at,
      person_id,
      registration_id,
      eckcm_people!inner(first_name_en, last_name_en, gender, birth_date),
      eckcm_registrations!inner(
        confirmation_code,
        event_id,
        eckcm_events!inner(name_en, name_ko, year, event_start_date, event_end_date, location)
      )
    `
    )
    .eq("token_hash", tokenHash)
    .single();

  if (!epass) {
    notFound();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = epass as any;

  // Fetch participant_code from group_memberships
  const { data: membership } = await admin
    .from("eckcm_group_memberships")
    .select("participant_code, eckcm_groups!inner(registration_id)")
    .eq("person_id", data.person_id)
    .eq("eckcm_groups.registration_id", data.registration_id)
    .maybeSingle();

  const participantCode = (membership as any)?.participant_code ?? null;

  // Sign participant code with HMAC if secret is configured
  let qrValue = participantCode;
  if (participantCode) {
    const { data: config } = await admin
      .from("eckcm_app_config")
      .select("epass_hmac_secret")
      .eq("id", 1)
      .single();
    const secret = (config as any)?.epass_hmac_secret;
    if (secret) {
      qrValue = signParticipantCode(participantCode, secret);
    }
  }

  return (
    <EPassViewer
      epass={{
        id: data.id,
        isActive: data.is_active,
        createdAt: data.created_at,
        participantCode,
        qrValue,
        person: {
          firstName: data.eckcm_people.first_name_en,
          lastName: data.eckcm_people.last_name_en,
          gender: data.eckcm_people.gender,
          birthDate: data.eckcm_people.birth_date,
        },
        registration: {
          event: {
            nameEn: data.eckcm_registrations.eckcm_events.name_en,
            nameKo: data.eckcm_registrations.eckcm_events.name_ko,
            year: data.eckcm_registrations.eckcm_events.year,
            startDate: data.eckcm_registrations.eckcm_events.event_start_date,
            endDate: data.eckcm_registrations.eckcm_events.event_end_date,
            venue: data.eckcm_registrations.eckcm_events.location,
          },
        },
      }}
    />
  );
}
