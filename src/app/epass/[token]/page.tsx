import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "crypto";
import { notFound } from "next/navigation";
import { EPassViewer } from "./epass-viewer";
import { signParticipantCode } from "@/lib/services/epass.service";
import {
  hasMembershipInRegistration,
  resolveParticipantCode,
} from "@/lib/services/participant-code.service";

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
      eckcm_people!inner(first_name_en, last_name_en, display_name_ko, gender, birth_date, church_other, eckcm_churches(name_en)),
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

  // A membership is the single source of truth for "this person belongs to this
  // registration". If it's gone, the person was transferred to another
  // registration (clone model) and this token is stale — possibly still
  // is_active=true if the transfer's deactivation step didn't run. Show an
  // explicit "transferred" notice instead of a broken "QR unavailable" pass, so
  // someone who follows an old link/QR understands their valid pass lives under
  // their new registration.
  const stillBelongs = await hasMembershipInRegistration(
    admin,
    data.person_id,
    data.registration_id,
  );
  if (!stillBelongs) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50 dark:bg-gray-950 p-4">
        <div className="w-full max-w-md rounded-lg border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-700 dark:bg-amber-950">
          <p className="text-lg font-semibold text-amber-800 dark:text-amber-300">
            This E-Pass is no longer valid
          </p>
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            이 E-Pass는 더 이상 유효하지 않습니다. 등록이 다른 등록으로
            이전되었습니다. 최신 E-Pass는 새 등록에서 확인하세요.
            <br />
            This registration was transferred. Please use the E-Pass from your
            current registration.
          </p>
        </div>
      </div>
    );
  }

  // Resolve participant_code robustly: tolerates duplicate membership rows
  // and self-heals NULL codes so the QR never silently disappears.
  const participantCode = await resolveParticipantCode(
    admin,
    data.person_id,
    data.registration_id,
  );

  // Fetch app config for HMAC secret and booklet URL
  const { data: appConfig } = await admin
    .from("eckcm_app_config")
    .select("epass_hmac_secret, booklet_url")
    .eq("id", 1)
    .single();

  // Sign participant code with HMAC if secret is configured
  let qrValue = participantCode;
  if (participantCode) {
    const secret = (appConfig as any)?.epass_hmac_secret;
    if (secret) {
      qrValue = signParticipantCode(participantCode, secret);
    }
  }

  const bookletUrl = (appConfig as any)?.booklet_url ?? "";

  return (
    <EPassViewer
      bookletUrl={bookletUrl}
      epass={{
        id: data.id,
        isActive: data.is_active,
        createdAt: data.created_at,
        confirmationCode: data.eckcm_registrations.confirmation_code ?? null,
        participantCode,
        qrValue,
        person: {
          firstName: data.eckcm_people.first_name_en,
          lastName: data.eckcm_people.last_name_en,
          displayNameKo: data.eckcm_people.display_name_ko ?? null,
          gender: data.eckcm_people.gender,
          birthDate: data.eckcm_people.birth_date,
          churchName: data.eckcm_people.church_other || data.eckcm_people.eckcm_churches?.name_en || null,
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
