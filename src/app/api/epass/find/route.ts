import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureEPassTokens, buildEPassUrl } from "@/lib/email/epass-link";
import {
  pickBestMembership,
  type MembershipCodeRow,
} from "@/lib/services/participant-code.service";

/**
 * Public "Find My E-Pass" resolver.
 *
 * Anyone (no login) can reach their own public /epass/{slug} page by proving
 * three things: legal English name, date of birth, and a code. The code may be
 * EITHER the registration confirmation code (eckcm_registrations.confirmation_code,
 * shared by the whole family group) OR the per-person participant code
 * (eckcm_group_memberships.participant_code, shown on the E-Pass). Either way,
 * name + birth date must also match — so all three fields are required.
 *
 * Errors are intentionally generic (NOT_FOUND for any mismatch) so the endpoint
 * never reveals which individual field was wrong.
 */

// Mirrors the check-in roster (SEARCHABLE_STATUSES): only registrations that can
// actually check in yield a usable pass. CANCELLED / REFUNDED / DRAFT excluded.
const ACTIVE_STATUSES = new Set(["PAID", "APPROVED", "SUBMITTED"]);

/** Case/space-insensitive comparison for Latin names (matches input + stored). */
const normName = (s: string) =>
  s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

interface FindRow extends MembershipCodeRow {
  person_id: string;
  eckcm_groups: {
    registration_id: string;
    eckcm_registrations: { confirmation_code: string; status: string };
  };
  eckcm_people: {
    first_name_en: string;
    last_name_en: string;
    birth_date: string | null;
  };
}

export async function POST(req: NextRequest) {
  let body: {
    firstName?: unknown;
    lastName?: unknown;
    birthDate?: unknown;
    code?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const firstName = typeof body.firstName === "string" ? body.firstName : "";
  const lastName = typeof body.lastName === "string" ? body.lastName : "";
  const birthDate = typeof body.birthDate === "string" ? body.birthDate : "";
  // Normalize identically on both sides: uppercase + strip whitespace. We make
  // NO assumption about the code's length or exact charset — match against the
  // stored value as-is so any registration / participant code format resolves.
  const code =
    typeof body.code === "string"
      ? body.code.toUpperCase().replace(/\s+/g, "")
      : "";

  const validBirth = /^\d{4}-\d{2}-\d{2}$/.test(birthDate);
  if (!firstName.trim() || !lastName.trim() || !validBirth || !code) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const admin = createAdminClient();

  // The code can be a registration confirmation code (lives on the nested
  // eckcm_registrations) OR a participant code (lives on the membership row
  // itself). Those sit on different tables, so we run two scoped queries and
  // merge — then match the specific person in JS (same join shape as the
  // check-in roster).
  const SELECT = `
      id,
      person_id,
      participant_code,
      status,
      created_at,
      eckcm_groups!inner(
        registration_id,
        eckcm_registrations!inner(confirmation_code, status)
      ),
      eckcm_people!inner(first_name_en, last_name_en, birth_date)
    `;

  const [byRegCode, byParticipantCode] = await Promise.all([
    admin
      .from("eckcm_group_memberships")
      .select(SELECT)
      .eq("eckcm_groups.eckcm_registrations.confirmation_code", code)
      .limit(200),
    admin
      .from("eckcm_group_memberships")
      .select(SELECT)
      .eq("participant_code", code)
      .limit(200),
  ]);

  if (byRegCode.error || byParticipantCode.error) {
    console.error(
      "[/api/epass/find] query failed:",
      byRegCode.error ?? byParticipantCode.error
    );
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }

  // Merge + de-duplicate by membership id (a row can satisfy both queries).
  const byId = new Map<string, FindRow>();
  for (const r of [
    ...(byRegCode.data ?? []),
    ...(byParticipantCode.data ?? []),
  ] as unknown as FindRow[]) {
    byId.set(r.id, r);
  }
  const rows = [...byId.values()];

  const fn = normName(firstName);
  const ln = normName(lastName);
  const matches = rows.filter((r) => {
    const reg = r.eckcm_groups?.eckcm_registrations;
    if (!reg || !ACTIVE_STATUSES.has(reg.status)) return false;
    const p = r.eckcm_people;
    if (!p) return false;
    return (
      normName(p.first_name_en) === fn &&
      normName(p.last_name_en) === ln &&
      p.birth_date === birthDate
    );
  });

  if (matches.length === 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // A person can have duplicate membership rows; resolve to one canonical
  // (person, registration) deterministically — same resolver the e-pass uses.
  const best = pickBestMembership(matches) as FindRow;
  const personId = best.person_id;
  const registrationId = best.eckcm_groups.registration_id;
  const person = best.eckcm_people;

  // Guarantee a token exists, then build the public slug. Empty baseUrl yields a
  // same-origin relative path the client redirects to.
  const tokenMap = await ensureEPassTokens(admin, registrationId, [personId]);
  const token = tokenMap.get(personId);
  if (!token) {
    console.error("[/api/epass/find] no token produced", {
      personId,
      registrationId,
    });
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }

  const url = buildEPassUrl(
    "",
    person.first_name_en,
    person.last_name_en,
    token
  );
  return NextResponse.json({ url });
}
