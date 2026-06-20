import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import {
  pickBestMembership,
  type MembershipCodeRow,
} from "@/lib/services/participant-code.service";

/**
 * Searchable roster for the main check-in desk.
 *
 * Unlike /api/checkin/epass-cache (active e-passes only, for offline scanning),
 * this returns EVERY checkable participant in the event — including unpaid
 * SUBMITTED walk-ins, who are inactive by nature but still need to be found and
 * routed to the On Site line. The client filters this list locally for the
 * search dropdown, so name / Korean name / email / phone / reg code / participant
 * code all resolve to a participant code the scanner can check in.
 *
 * Phone & email are returned for matching + disambiguation; they stay in client
 * memory only (not persisted to IndexedDB).
 */

// Registrations that can actually check in. Mirrors the verify route's MAIN
// line-router rule (PAID/APPROVED → Fast Track, SUBMITTED → On Site). Cancelled,
// refunded and draft registrations are excluded so they never appear as pickable.
const SEARCHABLE_STATUSES = new Set(["PAID", "APPROVED", "SUBMITTED"]);

interface RosterRow extends MembershipCodeRow {
  person_id: string;
  eckcm_groups: {
    registration_id: string;
    eckcm_registrations: {
      event_id: string;
      confirmation_code: string;
      status: string;
    };
  };
  eckcm_people: {
    first_name_en: string;
    last_name_en: string;
    display_name_ko: string | null;
    email: string | null;
    phone: string | null;
  };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const eventId = req.nextUrl.searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: memberships, error } = await admin
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
        eckcm_registrations!inner(event_id, confirmation_code, status)
      ),
      eckcm_people!inner(first_name_en, last_name_en, display_name_ko, email, phone)
    `
    )
    .eq("eckcm_groups.eckcm_registrations.event_id", eventId)
    .limit(5000);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load participants" },
      { status: 500 }
    );
  }

  // A person can have duplicate membership rows (and rows with NULL codes), so
  // collect every row per (person, registration) and pick the canonical code
  // with the same deterministic resolver the e-pass surfaces use.
  const rowsByKey = new Map<string, RosterRow[]>();
  for (const m of (memberships ?? []) as unknown as RosterRow[]) {
    const regId = m.eckcm_groups?.registration_id;
    if (!regId) continue;
    const key = `${m.person_id}:${regId}`;
    const list = rowsByKey.get(key) ?? [];
    list.push(m);
    rowsByKey.set(key, list);
  }

  const participants = [];
  for (const rows of rowsByKey.values()) {
    const best = pickBestMembership(rows);
    if (!best?.participant_code) continue;
    const reg = rows[0].eckcm_groups.eckcm_registrations;
    if (!SEARCHABLE_STATUSES.has(reg.status)) continue;
    const p = rows[0].eckcm_people;
    participants.push({
      participantCode: best.participant_code,
      name: `${p.first_name_en} ${p.last_name_en}`,
      koreanName: p.display_name_ko,
      email: p.email,
      phone: p.phone,
      confirmationCode: reg.confirmation_code,
      registrationStatus: reg.status,
    });
  }

  return NextResponse.json({ participants });
}
