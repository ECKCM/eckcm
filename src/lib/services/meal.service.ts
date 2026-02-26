import type { RoomGroupInput, MealSelection } from "@/lib/types/registration";

const MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER"] as const;

/** Fill default full-day selections when participant has empty mealSelections.
 *  Excludes event start/end dates (arrival/departure = no meals). */
export function populateDefaultMeals(
  roomGroups: RoomGroupInput[],
  mealStartDate: string,
  mealEndDate: string,
  eventStartDate: string,
  eventEndDate: string
): RoomGroupInput[] {
  const start = new Date(mealStartDate + "T00:00:00");
  const end = new Date(mealEndDate + "T00:00:00");
  const mealDates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().split("T")[0];
    if (iso === eventStartDate || iso === eventEndDate) continue;
    mealDates.push(iso);
  }

  return roomGroups.map((group) => ({
    ...group,
    participants: group.participants.map((p) => {
      if (p.mealSelections.length > 0) return p;
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
