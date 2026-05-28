import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

interface CheckinRow {
  id: string;
  person_id: string;
  event_id: string;
  scan_session_id: string | null;
  session_id: string | null;
  checkin_type: string;
  meal_date: string | null;
  meal_type: string | null;
  checked_in_at: string;
  checked_out_at: string | null;
  status: string;
  is_sandbox: boolean;
  eckcm_people: {
    first_name_en: string;
    last_name_en: string;
    display_name_ko: string | null;
  };
}

interface MembershipRow {
  person_id: string;
  participant_code: string;
  eckcm_groups: {
    registration_id: string;
    eckcm_registrations: { event_id: string; confirmation_code: string };
  };
}

/**
 * GET /api/checkin/recent — enriched recent check-ins for an event / scan session.
 *
 * Query params:
 *   eventId        — required
 *   scanSessionId  — optional; narrows to one scan session
 *   checkinType    — optional (MAIN/DINING/SESSION)
 *   limit          — default 30, max 200
 *   afterId        — optional; fetch only rows after this id (for realtime tail)
 *
 * Returns each check-in joined with the participant name/code so the client
 * can render the row without a second round-trip.
 */
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

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  const scanSessionId = searchParams.get("scanSessionId");
  const checkinType = searchParams.get("checkinType");
  const ids = searchParams.get("ids"); // comma-separated checkin ids (for realtime tail)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30", 10) || 30, 200);

  if (!eventId && !ids) {
    return NextResponse.json(
      { error: "eventId or ids is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let q = admin
    .from("eckcm_checkins")
    .select(`
      id,
      person_id,
      event_id,
      scan_session_id,
      session_id,
      checkin_type,
      meal_date,
      meal_type,
      checked_in_at,
      checked_out_at,
      status,
      is_sandbox,
      eckcm_people!inner(first_name_en, last_name_en, display_name_ko)
    `)
    .order("checked_in_at", { ascending: false })
    .limit(limit);

  if (ids) {
    const idList = ids.split(",").filter(Boolean);
    if (idList.length === 0) {
      return NextResponse.json({ checkins: [] });
    }
    q = q.in("id", idList);
  } else {
    if (eventId) q = q.eq("event_id", eventId);
    if (scanSessionId) q = q.eq("scan_session_id", scanSessionId);
    if (checkinType) q = q.eq("checkin_type", checkinType);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data as unknown as CheckinRow[]) ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ checkins: [] });
  }

  // Pull participant codes & confirmation codes in one query.
  const personIds = Array.from(new Set(rows.map((r) => r.person_id)));
  const { data: memberships } = await admin
    .from("eckcm_group_memberships")
    .select(`
      person_id,
      participant_code,
      eckcm_groups!inner(
        registration_id,
        eckcm_registrations!inner(event_id, confirmation_code)
      )
    `)
    .in("person_id", personIds);

  const codeByPerson = new Map<string, { participantCode: string; confirmationCode: string }>();
  for (const m of (memberships as unknown as MembershipRow[]) ?? []) {
    const reg = m.eckcm_groups.eckcm_registrations;
    // For people in multiple events, pick the one matching this event.
    if (!eventId || reg.event_id === eventId) {
      codeByPerson.set(m.person_id, {
        participantCode: m.participant_code,
        confirmationCode: reg.confirmation_code,
      });
    }
  }

  const checkins = rows.map((r) => {
    const codes = codeByPerson.get(r.person_id);
    return {
      id: r.id,
      personId: r.person_id,
      eventId: r.event_id,
      scanSessionId: r.scan_session_id,
      sessionId: r.session_id,
      checkinType: r.checkin_type,
      mealDate: r.meal_date,
      mealType: r.meal_type,
      checkedInAt: r.checked_in_at,
      checkedOutAt: r.checked_out_at,
      status: r.status,
      isSandbox: r.is_sandbox,
      person: {
        name: `${r.eckcm_people.first_name_en} ${r.eckcm_people.last_name_en}`,
        koreanName: r.eckcm_people.display_name_ko,
        participantCode: codes?.participantCode ?? null,
      },
      confirmationCode: codes?.confirmationCode ?? null,
    };
  });

  return NextResponse.json({ checkins });
}
