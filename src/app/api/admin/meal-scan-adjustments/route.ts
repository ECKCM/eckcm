import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { computeMealCategory } from "@/lib/services/participant-lookup";

/**
 * Admin scan-count adjustments for the Daily Meal Report.
 *
 * The "scanned" count is derived from individual eckcm_checkins rows (one row
 * per QR scan), so it isn't a single editable number. To let admins correct a
 * day's reported figure without touching real check-in history, we store a
 * signed delta per event+date+meal in eckcm_meal_scan_adjustments. The report
 * then shows: system count, adjustment, and adjusted total (clamped to >= 0).
 *
 * GET  — system counts + saved adjustments for one event+date.
 * POST — set/clear the adjustment for one meal.
 *
 * Restricted to SUPER_ADMIN / EVENT_ADMIN (requireAdmin) — this edits the
 * reconciliation figures UPJ bills against.
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
  eckcm_people: { birth_date: string | null } | null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
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
  // PostgREST's default 1000-row cap — page through with .range() so every
  // check-in is counted (a single un-paged select silently truncates).
  const PAGE = 1000;
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("eckcm_checkins")
      .select("meal_type, eckcm_people!inner(birth_date)")
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
  for (const r of rows) {
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
  }

  // Saved adjustments (signed deltas). Absent = 0.
  const adjustments: Record<MealKey, { value: number; note: string | null }> = {
    breakfast: { value: 0, note: null },
    lunch: { value: 0, note: null },
    dinner: { value: 0, note: null },
  };
  const { data: adjRows } = await admin
    .from("eckcm_meal_scan_adjustments")
    .select("meal_type, adjustment, note")
    .eq("event_id", eventId)
    .eq("meal_date", date);
  for (const a of (adjRows ?? []) as {
    meal_type: string;
    adjustment: number;
    note: string | null;
  }[]) {
    const key = MEAL_TYPE_TO_KEY[a.meal_type];
    if (key) adjustments[key] = { value: a.adjustment, note: a.note };
  }

  return NextResponse.json(
    { date, meals, adjustments },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * POST — set or clear the scan adjustment for one meal.
 *
 * Body: { eventId, date, mealType, adjustment, note? }
 *   adjustment number → upsert (may be negative)
 *   adjustment 0 / null → clear (delete the row; adjustment becomes 0)
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = auth;

  const body = await req.json().catch(() => ({}));
  const { eventId, date, mealType, note } = body as {
    eventId?: string;
    date?: string;
    mealType?: string;
    note?: string;
  };
  const rawAdjustment = (body as { adjustment?: unknown }).adjustment;

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

  // null / "" / 0 → clear the adjustment for this meal.
  if (
    rawAdjustment === null ||
    rawAdjustment === undefined ||
    rawAdjustment === "" ||
    Number(rawAdjustment) === 0
  ) {
    const { error } = await admin
      .from("eckcm_meal_scan_adjustments")
      .delete()
      .eq("event_id", eventId)
      .eq("meal_date", date)
      .eq("meal_type", mealType);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await admin.from("eckcm_audit_logs").insert({
      event_id: eventId,
      user_id: user.id,
      action: "MEAL_SCAN_ADJUSTMENT_CLEAR",
      entity_type: "meal_scan_adjustment",
      entity_id: eventId,
      new_data: { mealDate: date, mealType },
    });
    return NextResponse.json({ ok: true, adjustment: 0 });
  }

  const adjustment = Math.trunc(Number(rawAdjustment));
  if (!Number.isFinite(adjustment)) {
    return NextResponse.json(
      { error: "adjustment must be a whole number" },
      { status: 400 }
    );
  }

  const cleanNote =
    typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null;

  const { error } = await admin.from("eckcm_meal_scan_adjustments").upsert(
    {
      event_id: eventId,
      meal_date: date,
      meal_type: mealType,
      adjustment,
      note: cleanNote,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id,meal_date,meal_type" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("eckcm_audit_logs").insert({
    event_id: eventId,
    user_id: user.id,
    action: "MEAL_SCAN_ADJUSTMENT_SET",
    entity_type: "meal_scan_adjustment",
    entity_id: eventId,
    new_data: { mealDate: date, mealType, adjustment, note: cleanNote },
  });

  return NextResponse.json({ ok: true, adjustment });
}
