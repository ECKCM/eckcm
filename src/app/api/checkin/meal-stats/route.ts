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

// Disposable meal-pass redemption joined to its pass tier. Counted into the
// same meal tally as participant check-ins so the headcount reflects everyone
// served — registered attendees AND standalone meal-pass holders.
interface RedemptionRow {
  meal_pass_id: string;
  eckcm_meal_passes: { tier_code: string | null };
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

/** Fold meal-pass redemptions into an existing tally, tiered by the pass code. */
function addRedemptions(t: Tally, rows: RedemptionRow[]): void {
  for (const r of rows) {
    t.total += 1;
    const tier = r.eckcm_meal_passes?.tier_code ?? null;
    if (tier === "MEAL_GENERAL") t.general += 1;
    else if (tier === "MEAL_YOUTH") t.youth += 1;
    else t.unknown += 1;
  }
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

  // Fold in disposable meal-pass redemptions for this exact meal slot (live
  // only) so a standalone pass counts toward the headcount just like a
  // registered attendee's check-in. Paged the same way to dodge the 1000 cap.
  //
  // NON-FATAL: the meal-pass tables are a newer feature, so a missing table /
  // unapplied migration (common on a local DB) must NOT take down the whole
  // count — without this guard the participant headcount silently stops
  // updating ("기록이 안 됨"). On error we log and return the check-in count.
  try {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error: redError } = await admin
        .from("eckcm_meal_pass_redemptions")
        .select("meal_pass_id, eckcm_meal_passes!inner(tier_code)")
        .eq("event_id", eventId)
        .eq("meal_date", mealDate)
        .eq("meal_type", mealType)
        .eq("is_sandbox", false)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (redError) throw new Error(redError.message);
      const batch = (data as unknown as RedemptionRow[]) ?? [];
      addRedemptions(meal, batch);
      if (batch.length < PAGE) break;
    }
  } catch (e) {
    console.error(
      "[meal-stats] meal-pass redemption fold skipped:",
      e instanceof Error ? e.message : e
    );
  }

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
    // This scanner's own meal-pass redemptions count toward its session tally
    // too. Non-fatal for the same reason as the meal-wide fold above.
    try {
      const { data: sessRed, error: sessRedError } = await admin
        .from("eckcm_meal_pass_redemptions")
        .select("meal_pass_id, eckcm_meal_passes!inner(tier_code)")
        .eq("scan_session_id", scanSessionId);
      if (sessRedError) throw new Error(sessRedError.message);
      addRedemptions(session, (sessRed as unknown as RedemptionRow[]) ?? []);
    } catch (e) {
      console.error(
        "[meal-stats] session meal-pass redemption fold skipped:",
        e instanceof Error ? e.message : e
      );
    }
  }

  return NextResponse.json({ meal, session });
}
