"use client";

import { useMemo, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { MealSelection } from "@/lib/types/registration";
import type { MealType } from "@/lib/types/database";

const MEAL_TYPES: { type: MealType; label: string }[] = [
  { type: "BREAKFAST", label: "Breakfast" },
  { type: "LUNCH", label: "Lunch" },
  { type: "DINNER", label: "Dinner" },
];

type DayType = "no_meal" | "partial" | "fullday";

interface MealSelectionGridProps {
  startDate: string; // YYYY-MM-DD (check-in)
  endDate: string; // YYYY-MM-DD (check-out)
  eventStartDate: string; // YYYY-MM-DD (event start)
  eventEndDate: string; // YYYY-MM-DD (event end)
  selections: MealSelection[];
  onChange: (selections: MealSelection[]) => void;
}

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  while (current <= endDate) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getDayType(
  date: string,
  startDate: string,
  endDate: string,
  eventStartDate: string,
  eventEndDate: string
): DayType {
  if (date === eventStartDate || date === eventEndDate) return "no_meal";
  if (date === startDate) return "partial";
  if (date === endDate) return "partial";
  return "fullday";
}

/** Build the complete set of meal selections, merging existing with defaults */
function buildSelections(
  visibleDates: string[],
  startDate: string,
  endDate: string,
  eventStartDate: string,
  eventEndDate: string,
  existing: MealSelection[]
): MealSelection[] {
  const map = new Map<string, boolean>();
  for (const s of existing) map.set(`${s.date}|${s.mealType}`, s.selected);

  return visibleDates.flatMap((date) => {
    const dayType = getDayType(date, startDate, endDate, eventStartDate, eventEndDate);
    return MEAL_TYPES.map((meal) => ({
      date,
      mealType: meal.type,
      // Full days always selected; partial days use existing value or default true
      selected: dayType === "fullday" ? true : (map.get(`${date}|${meal.type}`) ?? true),
    }));
  });
}

export function MealSelectionGrid({
  startDate,
  endDate,
  eventStartDate,
  eventEndDate,
  selections,
  onChange,
}: MealSelectionGridProps) {
  const visibleDates = useMemo(
    () =>
      getDatesInRange(startDate, endDate).filter(
        (d) => getDayType(d, startDate, endDate, eventStartDate, eventEndDate) !== "no_meal"
      ),
    [startDate, endDate, eventStartDate, eventEndDate]
  );

  // Always-complete selections: fills gaps in props with defaults
  const effective = useMemo(
    () => buildSelections(visibleDates, startDate, endDate, eventStartDate, eventEndDate, selections),
    [visibleDates, startDate, endDate, eventStartDate, eventEndDate, selections]
  );

  // Sync to parent on mount (if empty) or when dates change (missing entries)
  useEffect(() => {
    if (visibleDates.length === 0) return;
    const parentDates = new Set(selections.map((s) => s.date));
    if (selections.length === 0 || !visibleDates.every((d) => parentDates.has(d))) {
      onChange(effective);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleDates]);

  const toggleMeal = (date: string, mealType: MealType) => {
    const updated = effective.map((s) =>
      s.date === date && s.mealType === mealType
        ? { ...s, selected: !s.selected }
        : s
    );
    onChange(updated);
  };

  const isChecked = (date: string, mealType: MealType): boolean =>
    effective.find((s) => s.date === date && s.mealType === mealType)?.selected ?? false;

  const selectedCount = effective.filter((s) => s.selected).length;

  if (visibleDates.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label className="text-xs">Meals ({selectedCount} selected)</Label>
      <div className="rounded-md border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_repeat(3,64px)] gap-0 bg-muted/50 px-2 py-1.5 text-xs font-medium text-muted-foreground">
          <span>Date</span>
          {MEAL_TYPES.map((m) => (
            <span key={m.type} className="text-center">
              {m.label}
            </span>
          ))}
        </div>
        {/* Rows */}
        {visibleDates.map((date) => {
          const dayType = getDayType(date, startDate, endDate, eventStartDate, eventEndDate);
          const isFullDay = dayType === "fullday";
          return (
            <div
              key={date}
              className={`grid grid-cols-[1fr_repeat(3,64px)] gap-0 items-center px-2 py-1.5 border-t text-xs ${
                isFullDay ? "bg-muted/30" : ""
              }`}
            >
              <span className="truncate">
                {formatDate(date)}
                {dayType === "partial" && (
                  <span className="ml-1 text-muted-foreground">(Partial)</span>
                )}
                {isFullDay && (
                  <span className="ml-1 text-muted-foreground">(Full Day)</span>
                )}
              </span>
              {MEAL_TYPES.map((meal) => (
                <div key={meal.type} className="flex justify-center">
                  <Checkbox
                    checked={isChecked(date, meal.type)}
                    onCheckedChange={() => toggleMeal(date, meal.type)}
                    disabled={isFullDay}
                    className={isFullDay ? "opacity-50" : ""}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
