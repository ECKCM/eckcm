export type MealKey = "breakfast" | "lunch" | "dinner";

export interface MealWindow {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export type MealSchedule = Record<MealKey, MealWindow>;

export const MEAL_KEYS: MealKey[] = ["breakfast", "lunch", "dinner"];

export const MEAL_KEY_TO_TYPE: Record<MealKey, "BREAKFAST" | "LUNCH" | "DINNER"> = {
  breakfast: "BREAKFAST",
  lunch: "LUNCH",
  dinner: "DINNER",
};

export const MEAL_TYPE_TO_KEY: Record<"BREAKFAST" | "LUNCH" | "DINNER", MealKey> = {
  BREAKFAST: "breakfast",
  LUNCH: "lunch",
  DINNER: "dinner",
};

export const DEFAULT_MEAL_SCHEDULE: MealSchedule = {
  breakfast: { start: "07:00", end: "09:30" },
  lunch:     { start: "12:00", end: "13:30" },
  dinner:    { start: "18:00", end: "19:30" },
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidTime(t: unknown): t is string {
  return typeof t === "string" && TIME_RE.test(t);
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Validate a meal schedule payload coming from the admin form. Either returns
 * a clean schedule object or an error message — never throws.
 */
export function validateMealSchedule(
  input: unknown
): { schedule: MealSchedule } | { error: string } {
  if (!input || typeof input !== "object") {
    return { error: "meal_schedule must be an object" };
  }
  const out: Partial<MealSchedule> = {};
  for (const key of MEAL_KEYS) {
    const window = (input as Record<string, unknown>)[key];
    if (!window || typeof window !== "object") {
      return { error: `meal_schedule.${key} is missing` };
    }
    const { start, end } = window as { start?: unknown; end?: unknown };
    if (!isValidTime(start) || !isValidTime(end)) {
      return { error: `meal_schedule.${key} requires start/end in HH:MM format` };
    }
    if (toMinutes(start) >= toMinutes(end)) {
      return { error: `meal_schedule.${key}: end must be after start` };
    }
    out[key] = { start, end };
  }
  return { schedule: out as MealSchedule };
}

/**
 * Pick the meal type whose window contains `now`. If no window contains it,
 * pick the *next* upcoming meal of the day. Falls back to lunch.
 */
export function suggestMealKey(
  schedule: MealSchedule,
  now: Date = new Date()
): MealKey {
  const cur = now.getHours() * 60 + now.getMinutes();
  for (const key of MEAL_KEYS) {
    const w = schedule[key];
    const s = toMinutes(w.start);
    const e = toMinutes(w.end);
    if (cur >= s && cur <= e) return key;
  }
  // Otherwise return the next upcoming window.
  const upcoming = MEAL_KEYS.map((k) => ({ k, s: toMinutes(schedule[k].start) })).find(
    (x) => x.s > cur
  );
  return upcoming?.k ?? "lunch";
}

export function formatMealWindow(window: MealWindow): string {
  return `${window.start} – ${window.end}`;
}
