import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCheckinStaff } from "@/lib/auth/admin";
import { computeMealCategory } from "@/lib/services/participant-lookup";

/**
 * GET /api/checkin/daily-meal-report — all three meals for one day, broken down
 * by age tier (General / Youth / Free), in a single pass.
 *
 * Query params:
 *   eventId — required
 *   date    — required (YYYY-MM-DD)
 *
 * Real (non-sandbox) DINING check-ins only. This is the figure UPJ reconciles
 * billing against, so simulations never count.
 */

type MealKey = "breakfast" | "lunch" | "dinner";

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

interface Row {
  meal_type: string | null;
  scan_session_id: string | null;
  eckcm_people: { birth_date: string | null } | null;
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
  const date = searchParams.get("date");
  if (!eventId || !date) {
    return NextResponse.json(
      { error: "eventId and date are required" },
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

  // A full day spans all three meals (1300+ rows is normal), which exceeds
  // PostgREST's default 1000-row cap — a single un-paged select silently
  // truncates and undercounts. Page through with .range() until a short page
  // signals the end so every check-in is counted.
  const PAGE = 1000;
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("eckcm_checkins")
      .select("meal_type, scan_session_id, eckcm_people!inner(birth_date)")
      .eq("event_id", eventId)
      .eq("checkin_type", "DINING")
      .eq("meal_date", date)
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

  const meals: Record<MealKey, Tally> = {
    breakfast: emptyTally(),
    lunch: emptyTally(),
    dinner: emptyTally(),
  };
  const totals = emptyTally();
  // Per-meal session breakdown: meal → scan_session_id ("" for none) → count.
  const sessionCounts: Record<MealKey, Map<string, number>> = {
    breakfast: new Map(),
    lunch: new Map(),
    dinner: new Map(),
  };

  for (const r of (rows as unknown as Row[]) ?? []) {
    const key = r.meal_type ? MEAL_TYPE_TO_KEY[r.meal_type] : undefined;
    if (!key) continue;
    const cat = computeMealCategory(r.eckcm_people?.birth_date ?? null, eventStartDate);
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
    totals.total += 1;
    totals[bucket] += 1;

    const sid = r.scan_session_id ?? "";
    sessionCounts[key].set(sid, (sessionCounts[key].get(sid) ?? 0) + 1);
  }

  // Resolve session labels for every session that contributed today.
  const allSessionIds = [
    ...new Set(
      (Object.values(sessionCounts) as Map<string, number>[])
        .flatMap((m) => [...m.keys()])
        .filter((id) => id !== "")
    ),
  ];
  const sessionMeta = new Map<string, { label: string | null; startedAt: string }>();
  if (allSessionIds.length) {
    const { data: sess } = await admin
      .from("eckcm_scan_sessions")
      .select("id, label, started_at")
      .in("id", allSessionIds);
    for (const s of (sess ?? []) as {
      id: string;
      label: string | null;
      started_at: string;
    }[]) {
      sessionMeta.set(s.id, { label: s.label, startedAt: s.started_at });
    }
  }

  // Shape the breakdown: ordered by session start time, "No session" last.
  const sessionsByMeal = {} as Record<
    MealKey,
    { id: string | null; label: string; startedAt: string | null; count: number }[]
  >;
  for (const key of ["breakfast", "lunch", "dinner"] as MealKey[]) {
    const list = [...sessionCounts[key].entries()].map(([sid, count]) => {
      const meta = sid ? sessionMeta.get(sid) : null;
      return {
        id: sid || null,
        label: meta?.label ?? (sid ? "Untitled session" : "No session"),
        count,
        startedAt: meta?.startedAt ?? "",
      };
    });
    list.sort((a, b) => {
      // Real sessions first (by start time), "No session" (empty startedAt) last.
      if (!a.startedAt && b.startedAt) return 1;
      if (a.startedAt && !b.startedAt) return -1;
      return a.startedAt.localeCompare(b.startedAt);
    });
    sessionsByMeal[key] = list.map(({ id, label, count, startedAt }) => ({
      id,
      label,
      startedAt: startedAt || null,
      count,
    }));
  }

  // UPJ staff manual (hand-counter) counts, per meal. Absent = not entered.
  const manual: Record<MealKey, number | null> = {
    breakfast: null,
    lunch: null,
    dinner: null,
  };
  const { data: manualRows } = await admin
    .from("eckcm_meal_manual_counts")
    .select("meal_type, count")
    .eq("event_id", eventId)
    .eq("meal_date", date);
  for (const m of (manualRows ?? []) as { meal_type: string; count: number }[]) {
    const key = MEAL_TYPE_TO_KEY[m.meal_type];
    if (key) manual[key] = m.count;
  }

  // Admin scan-count adjustments (signed deltas). Absent = 0. Folded into each
  // meal's total here so every consumer (cards, table, CSV, grand total) sees a
  // single corrected scanned figure; the raw system count isn't separately
  // exposed on this report. Adjusted total is clamped to >= 0.
  const { data: adjRows } = await admin
    .from("eckcm_meal_scan_adjustments")
    .select("meal_type, adjustment")
    .eq("event_id", eventId)
    .eq("meal_date", date);
  for (const a of (adjRows ?? []) as { meal_type: string; adjustment: number }[]) {
    const key = MEAL_TYPE_TO_KEY[a.meal_type];
    if (!key || !a.adjustment) continue;
    const t = meals[key];
    const before = t.total;
    const after = Math.max(0, before + a.adjustment);
    const delta = after - before;
    t.total = after;
    // Attribute the delta to "general" (the dominant, billable tier) so the
    // tier columns still sum to the total. Clamp the bucket at 0.
    t.general = Math.max(0, t.general + delta);
    totals.total = Math.max(0, totals.total + delta);
    totals.general = Math.max(0, totals.general + delta);
  }

  return NextResponse.json(
    { date, meals, totals, sessions: sessionsByMeal, manual },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * POST /api/checkin/daily-meal-report — set or clear the UPJ staff manual count
 * for one meal.
 *
 * Body: { eventId, date, mealType, count }
 *   count >= 0  → upsert
 *   count null  → clear (delete the row; meal becomes "not entered")
 */
export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => ({}));
  const { eventId, date, mealType } = body as {
    eventId?: string;
    date?: string;
    mealType?: string;
  };
  const rawCount = (body as { count?: unknown }).count;

  if (!eventId || !date || !mealType) {
    return NextResponse.json(
      { error: "eventId, date, and mealType are required" },
      { status: 400 }
    );
  }
  if (!["BREAKFAST", "LUNCH", "DINNER"].includes(mealType)) {
    return NextResponse.json(
      { error: "mealType must be BREAKFAST, LUNCH, or DINNER" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // null / "" → clear the manual count for this meal.
  if (rawCount === null || rawCount === undefined || rawCount === "") {
    const { error } = await admin
      .from("eckcm_meal_manual_counts")
      .delete()
      .eq("event_id", eventId)
      .eq("meal_date", date)
      .eq("meal_type", mealType);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, count: null });
  }

  const count = Math.trunc(Number(rawCount));
  if (!Number.isFinite(count) || count < 0) {
    return NextResponse.json(
      { error: "count must be a non-negative number" },
      { status: 400 }
    );
  }

  const { error } = await admin.from("eckcm_meal_manual_counts").upsert(
    {
      event_id: eventId,
      meal_date: date,
      meal_type: mealType,
      count,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id,meal_date,meal_type" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count });
}
