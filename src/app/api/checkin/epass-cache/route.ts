import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signParticipantCode } from "@/lib/services/epass.service";
import { getHmacSecret } from "@/lib/services/app-config-cache";
import {
  pickBestMembership,
  type MembershipCodeRow,
} from "@/lib/services/participant-code.service";

/**
 * Build the offline e-pass cache for the check-in kiosk / simulation.
 *
 * Source of truth is `eckcm_group_memberships`, not `eckcm_epass_tokens`:
 * every person who finished registration sits in memberships with a
 * participant_code, but the matching e-pass token row can be missing or
 * inactive (drift from earlier payment / approval flows). The old version
 * of this route started from tokens and silently dropped those people, so
 * a perfectly valid participant code would resolve to "Not in cache" on
 * the scanner. We now emit one cache row per (person, registration) found
 * via memberships and attach the token_hash + is_active flag only when a
 * token row actually exists.
 *
 * Each cache row needs a unique primary key in IndexedDB (the `tokenHash`
 * column). When no real hash is available we use a synthetic but stable
 * `nopass:<person>:<reg>` key — the participant-code index is the primary
 * scanner lookup path, so the synthetic value only needs to be unique.
 */
type MembershipRow = MembershipCodeRow & {
  person_id: string;
  eckcm_groups: {
    registration_id: string;
    eckcm_registrations: {
      id: string;
      confirmation_code: string;
      status: string;
      event_id: string;
      eckcm_events: {
        name_en: string;
        year: number;
        event_start_date: string | null;
      };
    };
  };
  eckcm_people: {
    first_name_en: string;
    last_name_en: string;
    display_name_ko: string | null;
    birth_date: string | null;
    gender: string | null;
  };
};

interface TokenRow {
  person_id: string;
  registration_id: string;
  token_hash: string;
  is_active: boolean;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = req.nextUrl.searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json(
      { error: "eventId is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: memberships, error: mErr } = await admin
    .from("eckcm_group_memberships")
    .select(
      `
      id,
      person_id,
      participant_code,
      status,
      created_at,
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
      eckcm_people!inner(first_name_en, last_name_en, display_name_ko, birth_date, gender)
    `
    )
    .eq("eckcm_groups.eckcm_registrations.event_id", eventId);

  if (mErr) {
    return NextResponse.json(
      { error: "Failed to fetch memberships" },
      { status: 500 }
    );
  }

  // Group rows by (person, registration). A person can have multiple
  // membership rows (and some with NULL participant_code) so we use the
  // same canonicalization helper the e-pass surfaces use.
  const rowsByKey = new Map<string, MembershipRow[]>();
  const sampleByKey = new Map<string, MembershipRow>();
  for (const m of (memberships ?? []) as unknown as MembershipRow[]) {
    const reg = m.eckcm_groups?.eckcm_registrations;
    if (!reg?.id) continue;
    const key = `${m.person_id}:${reg.id}`;
    const list = rowsByKey.get(key) ?? [];
    list.push(m);
    rowsByKey.set(key, list);
    if (!sampleByKey.has(key)) sampleByKey.set(key, m);
  }

  const codeMap = new Map<string, string | null>();
  for (const [key, rows] of rowsByKey) {
    codeMap.set(key, pickBestMembership(rows)?.participant_code ?? null);
  }

  // Attach token_hash + is_active where a real e-pass token exists.
  const sample = [...sampleByKey.values()];
  const personIds = [...new Set(sample.map((m) => m.person_id))];
  const regIds = [
    ...new Set(sample.map((m) => m.eckcm_groups.eckcm_registrations.id)),
  ];
  let tokens: TokenRow[] = [];
  if (personIds.length > 0 && regIds.length > 0) {
    const { data } = await admin
      .from("eckcm_epass_tokens")
      .select("person_id, registration_id, token_hash, is_active")
      .in("person_id", personIds)
      .in("registration_id", regIds);
    tokens = (data ?? []) as TokenRow[];
  }
  const tokenByKey = new Map<string, TokenRow>();
  for (const t of tokens) {
    tokenByKey.set(`${t.person_id}:${t.registration_id}`, t);
  }

  const hmacSecret = await getHmacSecret(admin);

  const out = [];
  for (const [key, m] of sampleByKey) {
    const reg = m.eckcm_groups.eckcm_registrations;
    const code = codeMap.get(key) ?? null;
    const tok = tokenByKey.get(key);
    out.push({
      tokenHash: tok?.token_hash ?? `nopass:${key}`,
      participantCode: code,
      signedCode:
        code && hmacSecret ? signParticipantCode(code, hmacSecret) : code,
      personName: `${m.eckcm_people.first_name_en} ${m.eckcm_people.last_name_en}`,
      koreanName: m.eckcm_people.display_name_ko,
      confirmationCode: reg.confirmation_code,
      eventId,
      eventName: reg.eckcm_events.name_en,
      eventYear: reg.eckcm_events.year,
      eventStartDate: reg.eckcm_events.event_start_date,
      birthDate: m.eckcm_people.birth_date,
      gender: m.eckcm_people.gender,
      // A person with no token row hasn't been explicitly deactivated, so
      // we treat them as active for the kiosk's purposes. The server-side
      // verify route is still the source of truth — the cache only powers
      // the optimistic UI + simulation.
      isActive: tok?.is_active ?? true,
      registrationStatus: reg.status,
    });
  }

  return NextResponse.json({
    tokens: out,
    cachedAt: new Date().toISOString(),
  });
}
