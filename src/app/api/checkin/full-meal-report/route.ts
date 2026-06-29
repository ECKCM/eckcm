import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCheckinStaff } from "@/lib/auth/admin";
import { computeMealCategory } from "@/lib/services/participant-lookup";

/**
 * GET /api/checkin/full-meal-report — every day of an event in one pass, each
 * day broken down by meal (breakfast / lunch / dinner) and age tier
 * (General / Youth / Free), with grand totals.
 *
 * Query params:
 *   eventId — required
 *
 * This is the multi-day rollup of /api/checkin/daily-meal-report. It mirrors
 * that endpoint's computation EXACTLY — real (non-sandbox) DINING check-ins,
 * folded scan-count adjustments, and the UPJ staff manual counts — so each
 * day's row here matches what staff see on the single-day report. Disposable
 * meal-pass redemptions are intentionally NOT counted, same as the daily
 * report.
 */

type MealKey = "breakfast" | "lunch" | "dinner";

const MEAL_KEYS: MealKey[] = ["breakfast", "lunch", "dinner"];
const MEAL_TYPE_TO_KEY: Record<string, MealKey> = {
  BREAKFAST: "breakfast",
  LUNCH: "lunch",
  DINNER: "dinner",
};

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

function emptyMeals(): Record<MealKey, Tally> {
  return { breakfast: emptyTally(), lunch: emptyTally(), dinner: emptyTally() };
}

interface Row {
  meal_type: string | null;
  meal_date: string | null;
  eckcm_people: { birth_date: string | null } | null;
}

/** Enumerate every calendar date in [start, end] inclusive as YYYY-MM-DD. */
function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  // Parse as plain calendar dates at UTC midnight to avoid TZ drift.
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return out;
  for (let d = s; d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = await requireCheckinStaff();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: ev } = await admin
    .from("eckcm_events")
    .select("event_start_date, event_end_date")
    .eq("id", eventId)
    .single();
  const eventStartDate =
    (ev as { event_start_date: string | null } | null)?.event_start_date ?? null;
  const eventEndDate =
    (ev as { event_end_date: string | null } | null)?.event_end_date ?? null;

  // Seed the day list from the event's configured span so days with zero
  // scans still appear (a missing meal is itself information). Any check-in
  // dated outside that span is added below so nothing is silently dropped.
  const days = new Map<string, Record<MealKey, Tally>>();
  if (eventStartDate && eventEndDate) {
    for (const d of enumerateDates(eventStartDate, eventEndDate)) {
      days.set(d, emptyMeals());
    }
  }

  // An entire event spans thousands of check-ins, well past PostgREST's
  // default 1000-row cap — an un-paged select silently truncates and
  // undercounts. Page through with .range() until a short page signals the end.
  const PAGE = 1000;
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("eckcm_checkins")
      .select("meal_type, meal_date, eckcm_people!inner(birth_date)")
      .eq("event_id", eventId)
      .eq("checkin_type", "DINING")
      .eq("is_sandbox", false)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const batch = (data as unknown as Row[]) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  for (const r of rows) {
    const key = r.meal_type ? MEAL_TYPE_TO_KEY[r.meal_type] : undefined;
    const date = r.meal_date;
    if (!key || !date) continue;
    let meals = days.get(date);
    if (!meals) {
      meals = emptyMeals();
      days.set(date, meals);
    }
    const cat = computeMealCategory(
      r.eckcm_people?.birth_date ?? null,
      eventStartDate
    );
    const bucket: keyof Tally =
      cat === "adult"
        ? "general"
        : cat === "youth"
          ? "youth"
          : cat === "free"
            ? "free"
            : "unknown";
    meals[key].total += 1;
    meals[key][bucket] += 1;
  }

  // Fold admin scan-count adjustments (signed deltas) into each day's meal,
  // identically to the daily report: adjusted total clamped to >= 0, the delta
  // attributed to "general" so tier columns still sum to the total.
  const { data: adjRows } = await admin
    .from("eckcm_meal_scan_adjustments")
    .select("meal_type, meal_date, adjustment")
    .eq("event_id", eventId);
  for (const a of (adjRows ?? []) as {
    meal_type: string;
    meal_date: string;
    adjustment: number;
  }[]) {
    const key = MEAL_TYPE_TO_KEY[a.meal_type];
    if (!key || !a.adjustment || !a.meal_date) continue;
    let meals = days.get(a.meal_date);
    if (!meals) {
      meals = emptyMeals();
      days.set(a.meal_date, meals);
    }
    const t = meals[key];
    const after = Math.max(0, t.total + a.adjustment);
    const delta = after - t.total;
    t.total = after;
    t.general = Math.max(0, t.general + delta);
  }

  // UPJ staff manual (hand-counter) counts, per day + meal. Absent = not entered.
  const manualByDay = new Map<string, Record<MealKey, number | null>>();
  const { data: manualRows } = await admin
    .from("eckcm_meal_manual_counts")
    .select("meal_type, meal_date, count")
    .eq("event_id", eventId);
  for (const m of (manualRows ?? []) as {
    meal_type: string;
    meal_date: string;
    count: number;
  }[]) {
    const key = MEAL_TYPE_TO_KEY[m.meal_type];
    if (!key || !m.meal_date) continue;
    let row = manualByDay.get(m.meal_date);
    if (!row) {
      row = { breakfast: null, lunch: null, dinner: null };
      manualByDay.set(m.meal_date, row);
    }
    row[key] = m.count;
  }

  // Shape: one entry per date, chronologically; plus grand totals across all
  // days. The manual grand total is null unless at least one meal was entered.
  const sortedDates = [...days.keys()].sort();
  const grand = emptyMeals();
  const grandTotals = emptyTally();
  let grandManual = 0;
  let anyManual = false;

  const daysOut = sortedDates.map((date) => {
    const meals = days.get(date) ?? emptyMeals();
    const dayTotals = emptyTally();
    for (const key of MEAL_KEYS) {
      const t = meals[key];
      for (const f of ["total", "general", "youth", "free", "unknown"] as const) {
        grand[key][f] += t[f];
        dayTotals[f] += t[f];
        grandTotals[f] += t[f];
      }
    }
    const manual = manualByDay.get(date) ?? {
      breakfast: null,
      lunch: null,
      dinner: null,
    };
    let dayManual: number | null = null;
    for (const key of MEAL_KEYS) {
      if (manual[key] !== null) {
        dayManual = (dayManual ?? 0) + (manual[key] as number);
        grandManual += manual[key] as number;
        anyManual = true;
      }
    }
    return { date, meals, dayTotals, manual, dayManual };
  });

  return NextResponse.json(
    {
      eventStartDate,
      eventEndDate,
      days: daysOut,
      grand,
      grandTotals,
      grandManual: anyManual ? grandManual : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
