import type { RoomGroupInput, MealSelection } from "@/lib/types/registration";

const MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER"] as const;

/** Build the list of meal-eligible dates between start and end, excluding event start/end. */
function getMealDates(
  startDate: string,
  endDate: string,
  eventStartDate: string,
  eventEndDate: string
): string[] {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().split("T")[0];
    if (iso === eventStartDate || iso === eventEndDate) continue;
    dates.push(iso);
  }
  return dates;
}

/** Fill default full-day selections when participant has empty mealSelections.
 *  Uses per-participant dates when available, otherwise group-level dates.
 *  Excludes event start/end dates (arrival/departure = no meals). */
export function populateDefaultMeals(
  roomGroups: RoomGroupInput[],
  mealStartDate: string,
  mealEndDate: string,
  eventStartDate: string,
  eventEndDate: string
): RoomGroupInput[] {
  return roomGroups.map((group) => ({
    ...group,
    participants: group.participants.map((p) => {
      if (p.mealSelections.length > 0) return p;
      // Use individual dates if overridden, otherwise group-level dates
      const pStart = p.checkInDate ?? mealStartDate;
      const pEnd = p.checkOutDate ?? mealEndDate;
      const mealDates = getMealDates(pStart, pEnd, eventStartDate, eventEndDate);
      const defaultSelections: MealSelection[] = [];
      for (const date of mealDates) {
        for (const mealType of MEAL_TYPES) {
          defaultSelections.push({ date, mealType, selected: true });
        }
      }
      return { ...p, mealSelections: defaultSelections };
    }),
  }));
}
