/**
 * Pure formatting helpers for the admin Registration Summary print page.
 *
 * These are presentation helpers shared by the print API route (which builds the
 * payload) and could be unit-tested in isolation. All date math is done on the
 * calendar date only (no wall-clock time), so it is timezone-stable: a meal date
 * "2026-05-26" always maps to the same weekday regardless of the server TZ.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Willow Hall lodging categories — these receive their keys separately, so the
 *  print shows "Willow Key" instead of a deposit count. */
export const WILLOW_LODGING_TYPES = [
  "LODGING_WILLOW_EM",
  "LODGING_WILLOW_HANSAMO",
] as const;

export function isWillowLodging(lodgingType: string | null | undefined): boolean {
  return (
    lodgingType === "LODGING_WILLOW_EM" ||
    lodgingType === "LODGING_WILLOW_HANSAMO"
  );
}

/** Parse a YYYY-MM-DD calendar date at UTC noon (DST-safe for weekday/label use). */
function parseISODate(iso: string): Date {
  return new Date(iso + "T12:00:00Z");
}

/** Short weekday label ("Mon".."Sun") for a calendar date string. */
export function weekdayShort(iso: string): string {
  return WEEKDAYS[parseISODate(iso).getUTCDay()];
}

/** "May 26" style short date label for a calendar date string. */
export function formatDateShort(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** The calendar date one day after `iso`, as YYYY-MM-DD. */
function nextDay(iso: string): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Format a stay range. Falls back to "—" if neither endpoint is known. */
export function formatStayDates(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start && !end) return "—";
  if (start && end) {
    if (start === end) return formatDateShort(start);
    return `${formatDateShort(start)} – ${formatDateShort(end)}`;
  }
  return formatDateShort((start ?? end) as string);
}

/**
 * Compact room-number display for tight print cells (label + summary header).
 * A single room shows as-is; 2+ rooms collapse to an ellipsis (the full list
 * costs too much horizontal space); none → "—". Pair with a `title` attribute
 * holding the full joined list for on-screen hover.
 */
export function formatRoomsCompact(rooms: string[]): string {
  if (rooms.length === 0) return "—";
  if (rooms.length === 1) return rooms[0];
  return "…";
}

export interface MealRow {
  meal_date: string;
  meal_type: string;
  is_selected: boolean;
}

const MEAL_LETTER: Record<string, "B" | "L" | "D"> = {
  BREAKFAST: "B",
  LUNCH: "L",
  DINNER: "D",
};

/** Collapse meal rows into a map of date → set of selected meal letters. */
function mealsByDate(rows: MealRow[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.is_selected) continue;
    const letter = MEAL_LETTER[r.meal_type];
    if (!letter) continue;
    if (!map.has(r.meal_date)) map.set(r.meal_date, new Set());
    map.get(r.meal_date)!.add(letter);
  }
  return map;
}

function isFull(set: Set<string>): boolean {
  return set.has("B") && set.has("L") && set.has("D");
}

/** "BL", "D", "BLD" — meal letters in B-L-D order. */
function annotate(set: Set<string>): string {
  return (["B", "L", "D"] as const).filter((l) => set.has(l)).join("");
}

/** A single day token: "Tue" when full, "Tue (BL)" when partial. */
function dayToken(iso: string, byDate: Map<string, Set<string>>): string {
  const set = byDate.get(iso)!;
  const wd = weekdayShort(iso);
  return isFull(set) ? wd : `${wd} (${annotate(set)})`;
}

/** Format one run of calendar-consecutive meal days. Interior days are assumed
 *  full and collapsed into a range; endpoints annotate their partial meals.
 *  Falls back to a per-day list if an interior day is itself partial. */
function formatRun(run: string[], byDate: Map<string, Set<string>>): string {
  if (run.length === 1) return dayToken(run[0], byDate);
  const interiorAllFull = run
    .slice(1, -1)
    .every((d) => isFull(byDate.get(d)!));
  if (interiorAllFull) {
    return `${dayToken(run[0], byDate)} - ${dayToken(run[run.length - 1], byDate)}`;
  }
  return run.map((d) => dayToken(d, byDate)).join(", ");
}

/** Enumerate meal-eligible dates in [start, end], excluding arrival/departure
 *  (the event start & end days). Used to synthesize the default full plan. */
function eligibleDatesInRange(
  start: string,
  end: string,
  eventStart: string | null,
  eventEnd: string | null,
): string[] {
  if (start > end) return [];
  const out: string[] = [];
  for (let d = start; d <= end; d = nextDay(d)) {
    if (d === eventStart || d === eventEnd) continue;
    out.push(d);
  }
  return out;
}

/**
 * Human-readable meal plan for one participant.
 *
 *  - "Full Meal Plan" when the participant eats every meal on every meal-eligible
 *    day of the event (event window minus arrival/departure days).
 *  - "Tue - Sat" when all days are full but only span part of the event.
 *  - "Wed (BL) - Fri (D)" when arrival/departure days are partial.
 *  - "Sat (L)" for a single partial day.
 *  - Non-consecutive blocks are joined with ", ".
 *
 * When a participant has NO meal rows at all (e.g. admin-created or legacy
 * registrations that never persisted a selection), we fall back to the default
 * full plan for their stay — matching the registration wizard's convention that
 * an empty selection means "all meals". `stay` supplies that fallback window.
 */
export function formatMeals(
  rows: MealRow[],
  eventStart: string | null,
  eventEnd: string | null,
  stay?: { start: string | null; end: string | null },
): string {
  const byDate = mealsByDate(rows);

  // No selected meals. Distinguish "never recorded" (default to full plan) from
  // "explicitly opted out of every meal" (genuinely no meals).
  if (byDate.size === 0) {
    if (rows.length === 0 && stay?.start && stay?.end) {
      for (const d of eligibleDatesInRange(stay.start, stay.end, eventStart, eventEnd)) {
        byDate.set(d, new Set(["B", "L", "D"]));
      }
    }
    if (byDate.size === 0) return rows.length === 0 ? "—" : "No meals";
  }

  const dates = [...byDate.keys()].sort();

  // Full Meal Plan: every event meal-day (strictly between start & end) is present
  // and full, with no extra/partial days.
  if (eventStart && eventEnd) {
    const eventDays: string[] = [];
    for (let d = nextDay(eventStart); d < eventEnd; d = nextDay(d)) {
      eventDays.push(d);
    }
    const matchesFullPlan =
      eventDays.length > 0 &&
      dates.length === eventDays.length &&
      eventDays.every((d) => {
        const s = byDate.get(d);
        return s != null && isFull(s);
      });
    if (matchesFullPlan) return "Full Meal Plan";
  }

  // Otherwise build calendar-consecutive runs and format each.
  const runs: string[][] = [];
  let cur: string[] = [];
  for (const d of dates) {
    if (cur.length === 0 || nextDay(cur[cur.length - 1]) === d) {
      cur.push(d);
    } else {
      runs.push(cur);
      cur = [d];
    }
  }
  if (cur.length) runs.push(cur);

  return runs.map((run) => formatRun(run, byDate)).join(", ");
}

export interface KeyDepositGroup {
  lodgingType: string | null;
  keyCount: number;
}

/**
 * Summarize the key deposit for a whole registration (which may span several
 * room groups).
 *
 * Only Willow lodging (LODGING_WILLOW_EM / LODGING_WILLOW_HANSAMO) is special —
 * those receive their keys separately, so they show "Willow Key". EVERY other
 * lodging type shows its exact key count (the stored `key_count`), regardless of
 * any deposit-fee toggle.
 *
 *  - "2 keys" for a normal group with 2 keys.
 *  - "Willow Key" for a Willow-only registration.
 *  - "1 key + Willow Key" when both are present.
 */
export function formatKeyDeposit(groups: KeyDepositGroup[]): string {
  let normalKeys = 0;
  let hasNormal = false;
  let hasWillow = false;
  for (const g of groups) {
    if (isWillowLodging(g.lodgingType)) {
      hasWillow = true;
    } else {
      hasNormal = true;
      normalKeys += g.keyCount ?? 0;
    }
  }

  const parts: string[] = [];
  if (hasNormal) parts.push(`${normalKeys} ${normalKeys === 1 ? "key" : "keys"}`);
  if (hasWillow) parts.push("Willow Key");
  if (parts.length === 0) return "—";
  return parts.join(" + ");
}
