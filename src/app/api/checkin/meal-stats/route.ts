import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCheckinStaff } from "@/lib/auth/admin";
import { computeMealCategory } from "@/lib/services/participant-lookup";

/**
 * GET /api/checkin/meal-stats — accurate served-meal counts by age tier.
 *
 * Query params:
 *   eventId        — required
 *   mealDate       — required (YYYY-MM-DD)
 *   mealType       — required (BREAKFAST | LUNCH | DINNER)
 *   scanSessionId  — optional; also returns the tally for that scan session
 *
 * The meal category (General / Youth / Free) is derived from each person's
 * birth date relative to the event start date — it is NOT stored on the
 * check-in row — so this endpoint joins people and computes it server-side.
 * The `meal` tally is the authoritative count of everyone served this meal
 * across every kiosk/phone (sandbox excluded). The `session` tally is this
 * one scanner's contribution (sandbox included, since a test session only
 * ever holds sandbox rows).
 */

const MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER"] as const;

interface CheckinPersonRow {
  person_id: string;
  eckcm_people: { birth_date: string | null };
}

interface Tally {
  total: number;
  general: number;
  youth: number;
  free: number;
  unknown: number;
}

function emptyTally(): Tally {
  return { total: 0, general: 0, youth: 0, free: 0, unknown: 0 };
}

function tally(rows: CheckinPersonRow[], eventStartDate: string | null): Tally {
  const t = emptyTally();
  for (const r of rows) {
    t.total += 1;
    const cat = computeMealCategory(r.eckcm_people?.birth_date ?? null, eventStartDate);
    if (cat === "adult") t.general += 1;
    else if (cat === "youth") t.youth += 1;
    else if (cat === "free") t.free += 1;
    else t.unknown += 1;
  }
  return t;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminAuth = await requireCheckinStaff();
  if (!adminAuth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  const mealDate = searchParams.get("mealDate");
  const mealType = searchParams.get("mealType");
  const scanSessionId = searchParams.get("scanSessionId");

  if (!eventId || !mealDate || !mealType) {
    return NextResponse.json(
      { error: "eventId, mealDate, and mealType are required" },
      { status: 400 }
    );
  }
  if (!MEAL_TYPES.includes(mealType as (typeof MEAL_TYPES)[number])) {
    return NextResponse.json(
      { error: "mealType must be BREAKFAST, LUNCH, or DINNER" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: ev } = await admin
    .from("eckcm_events")
    .select("event_start_date")
    .eq("id", eventId)
    .single();
  const eventStartDate =
    (ev as { event_start_date: string | null } | null)?.event_start_date ?? null;

  // Meal-wide authoritative count (real check-ins only). Page through with
  // .range() — a busy meal can exceed PostgREST's default 1000-row cap, and an
  // un-paged select would silently truncate and undercount the headcount.
  const PAGE = 1000;
  const mealRows: CheckinPersonRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error: mealError } = await admin
      .from("eckcm_checkins")
      .select("person_id, eckcm_people!inner(birth_date)")
      .eq("event_id", eventId)
      .eq("checkin_type", "DINING")
      .eq("meal_date", mealDate)
      .eq("meal_type", mealType)
      .eq("is_sandbox", false)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (mealError) {
      return NextResponse.json({ error: mealError.message }, { status: 500 });
    }
    const batch = (data as unknown as CheckinPersonRow[]) ?? [];
    mealRows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const meal = tally(mealRows, eventStartDate);

  let session: Tally | null = null;
  if (scanSessionId) {
    const { data: sessionData, error: sessionError } = await admin
      .from("eckcm_checkins")
      .select("person_id, eckcm_people!inner(birth_date)")
      .eq("scan_session_id", scanSessionId);
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    session = tally(
      (sessionData as unknown as CheckinPersonRow[]) ?? [],
      eventStartDate
    );
  }

  return NextResponse.json({ meal, session });
}
