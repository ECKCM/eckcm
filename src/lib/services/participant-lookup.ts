import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifySignedCode } from "@/lib/services/epass.service";
import { resolveParticipantCode } from "@/lib/services/participant-code.service";

export interface ResolvedParticipant {
  personId: string;
  participantCode: string | null;
  legalName: string;
  koreanName: string | null;
  gender: string | null;
  birthDate: string | null;
  isEpassActive: boolean;
  registration: {
    id: string;
    confirmationCode: string;
    status: string;
  };
  event: {
    id: string;
    name: string;
    year: number;
    startDate: string | null;
  };
}

export type ResolveError =
  | { code: "missing_input"; message: string }
  | { code: "invalid_signature"; message: string }
  | { code: "not_found"; message: string };

type ResolveResult =
  | { ok: true; participant: ResolvedParticipant }
  | { ok: false; error: ResolveError };

interface MembershipJoined {
  person_id: string;
  participant_code: string;
  eckcm_groups: {
    registration_id: string;
    eckcm_registrations: {
      id?: string;
      confirmation_code: string;
      status: string;
      event_id: string;
      eckcm_events: { name_en: string; year: number; event_start_date: string | null };
    };
  };
  eckcm_people: {
    first_name_en: string;
    last_name_en: string;
    display_name_ko: string | null;
    gender: string | null;
    birth_date: string | null;
  };
}

interface EpassJoined {
  id: string;
  person_id: string;
  registration_id: string;
  is_active: boolean;
  eckcm_people: {
    first_name_en: string;
    last_name_en: string;
    display_name_ko: string | null;
    gender: string | null;
    birth_date: string | null;
  };
  eckcm_registrations: {
    id?: string;
    confirmation_code: string;
    status: string;
    event_id: string;
    eckcm_events: { name_en: string; year: number; event_start_date: string | null };
  };
}

/**
 * Resolve a participant from either a participant code (plain or HMAC-signed)
 * or a legacy epass token. Returns enriched participant data ready for UI.
 *
 * Uses an admin client (RLS-bypassing) because check-in staff need to look up
 * any participant in the event, and authorization is already enforced upstream.
 */
export async function resolveParticipant(
  admin: SupabaseClient,
  input: { token?: string | null; participantCode?: string | null; hmacSecret?: string | null }
): Promise<ResolveResult> {
  const { token, participantCode, hmacSecret } = input;

  if (!token && !participantCode) {
    return { ok: false, error: { code: "missing_input", message: "token or participantCode is required" } };
  }

  if (participantCode) {
    let resolvedCode = participantCode;
    if (participantCode.includes(".")) {
      if (hmacSecret) {
        const { valid, participantCode: code } = verifySignedCode(participantCode, hmacSecret);
        if (!valid) {
          return { ok: false, error: { code: "invalid_signature", message: "Invalid QR signature" } };
        }
        resolvedCode = code;
      } else {
        resolvedCode = participantCode.split(".")[0];
      }
    }

    const { data: membership, error } = await admin
      .from("eckcm_group_memberships")
      .select(`
        person_id,
        participant_code,
        eckcm_groups!inner(
          registration_id,
          eckcm_registrations!inner(
            id,
            confirmation_code,
            status,
            event_id,
            eckcm_events!inner(name_en, year, event_start_date)
          )
        ),
        eckcm_people!inner(first_name_en, last_name_en, display_name_ko, gender, birth_date)
      `)
      .eq("participant_code", resolvedCode)
      .single();

    if (error || !membership) {
      return { ok: false, error: { code: "not_found", message: "Invalid participant code" } };
    }

    const m = membership as unknown as MembershipJoined;
    const reg = m.eckcm_groups.eckcm_registrations;

    const { data: epass } = await admin
      .from("eckcm_epass_tokens")
      .select("is_active")
      .eq("person_id", m.person_id)
      .eq("registration_id", m.eckcm_groups.registration_id)
      .maybeSingle();

    return {
      ok: true,
      participant: {
        personId: m.person_id,
        participantCode: m.participant_code,
        legalName: `${m.eckcm_people.first_name_en} ${m.eckcm_people.last_name_en}`,
        koreanName: m.eckcm_people.display_name_ko,
        gender: m.eckcm_people.gender,
        birthDate: m.eckcm_people.birth_date,
        isEpassActive: epass?.is_active ?? true,
        registration: {
          id: reg.id ?? m.eckcm_groups.registration_id,
          confirmationCode: reg.confirmation_code,
          status: reg.status,
        },
        event: {
          id: reg.event_id,
          name: reg.eckcm_events.name_en,
          year: reg.eckcm_events.year,
          startDate: reg.eckcm_events.event_start_date,
        },
      },
    };
  }

  // Legacy token path
  const tokenHash = createHash("sha256").update(token!).digest("hex");
  const { data: epass, error } = await admin
    .from("eckcm_epass_tokens")
    .select(`
      id,
      person_id,
      registration_id,
      is_active,
      eckcm_people!inner(first_name_en, last_name_en, display_name_ko, gender, birth_date),
      eckcm_registrations!inner(
        id,
        confirmation_code,
        status,
        event_id,
        eckcm_events!inner(name_en, year, event_start_date)
      )
    `)
    .eq("token_hash", tokenHash)
    .single();

  if (error || !epass) {
    return { ok: false, error: { code: "not_found", message: "Invalid E-Pass token" } };
  }

  const d = epass as unknown as EpassJoined;
  // For legacy token resolutions we also try to recover the participant code
  // via membership. resolveParticipantCode tolerates duplicate rows and heals
  // NULL codes — the previous inline query filtered on a join it never
  // embedded in the select, so it errored and resolved nothing.
  const recoveredCode = await resolveParticipantCode(
    admin,
    d.person_id,
    d.registration_id
  );

  return {
    ok: true,
    participant: {
      personId: d.person_id,
      participantCode: recoveredCode,
      legalName: `${d.eckcm_people.first_name_en} ${d.eckcm_people.last_name_en}`,
      koreanName: d.eckcm_people.display_name_ko,
      gender: d.eckcm_people.gender,
      birthDate: d.eckcm_people.birth_date,
      isEpassActive: d.is_active,
      registration: {
        id: d.eckcm_registrations.id ?? d.registration_id,
        confirmationCode: d.eckcm_registrations.confirmation_code,
        status: d.eckcm_registrations.status,
      },
      event: {
        id: d.eckcm_registrations.event_id,
        name: d.eckcm_registrations.eckcm_events.name_en,
        year: d.eckcm_registrations.eckcm_events.year,
        startDate: d.eckcm_registrations.eckcm_events.event_start_date,
      },
    },
  };
}

/**
 * Compute meal category from birth date relative to an event start date.
 * Mirrors the e-pass viewer logic so on-site staff see the same category
 * the participant sees on their pass.
 *   age >= 11  → adult ("General" meal)
 *   age >=  5  → youth
 *   else       → free (under 5, no meal)
 */
export function computeMealCategory(
  birthDate: string | null,
  eventStartDate: string | null
): "adult" | "youth" | "free" | null {
  if (!birthDate || !eventStartDate) return null;
  const birth = new Date(birthDate);
  const ref = new Date(eventStartDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  if (age >= 11) return "adult";
  if (age >= 5) return "youth";
  return "free";
}
