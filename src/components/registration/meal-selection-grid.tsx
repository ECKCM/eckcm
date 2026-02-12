"use client";

import { useCallback, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { MealSelection } from "@/lib/types/registration";
import type { MealType } from "@/lib/types/database";

const MEAL_TYPES: { type: MealType; label: string; short: string }[] = [
  { type: "BREAKFAST", label: "Breakfast", short: "B" },
  { type: "LUNCH", label: "Lunch", short: "L" },
  { type: "DINNER", label: "Dinner", short: "D" },
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
  // Event start/end dates: no meal at all
  if (date === eventStartDate || date === eventEndDate) return "no_meal";
  // Check-in date (if different from event start): partial
  if (date === startDate) return "partial";
  // Check-out date (if different from event end): partial
  if (date === endDate) return "partial";
  // Everything else: full day (locked)
  return "fullday";
}

export function MealSelectionGrid({
  startDate,
  endDate,
  eventStartDate,
  eventEndDate,
  selections,
  onChange,
}: MealSelectionGridProps) {
  const allDates = getDatesInRange(startDate, endDate);
  // Filter out event start/end dates (no meals)
  const visibleDates = allDates.filter(
    (d) => getDayType(d, startDate, endDate, eventStartDate, eventEndDate) !== "no_meal"
  );

  // Initialize default selections when dates change
  const initializeSelections = useCallback(() => {
    if (visibleDates.length === 0) return;

    // Check if selections already exist for these visible dates
    const existingDates = new Set(selections.map((s) => s.date));
    const allDatesExist = visibleDates.every((d) => existingDates.has(d));
    if (allDatesExist && selections.length > 0) return;

    const newSelections: MealSelection[] = [];
    for (const date of visibleDates) {
      const dayType = getDayType(date, startDate, endDate, eventStartDate, eventEndDate);
      for (const meal of MEAL_TYPES) {
        // Preserve existing selection if available
        const existing = selections.find(
          (s) => s.date === date && s.mealType === meal.type
        );
        const defaultSelected = dayType === "fullday"; // full days default checked, partial days unchecked
        newSelections.push({
          date,
          mealType: meal.type,
          selected: existing !== undefined ? existing.selected : defaultSelected,
        });
      }
    }
    onChange(newSelections);
  }, [visibleDates.join(","), startDate, endDate, eventStartDate, eventEndDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    initializeSelections();
  }, [initializeSelections]);

  const toggleMeal = (date: string, mealType: MealType) => {
    const updated = selections.map((s) =>
      s.date === date && s.mealType === mealType
        ? { ...s, selected: !s.selected }
        : s
    );
    onChange(updated);
  };

  const isChecked = (date: string, mealType: MealType): boolean => {
    return (
      selections.find((s) => s.date === date && s.mealType === mealType)
        ?.selected ?? false
    );
  };

  const selectedCount = selections.filter((s) => s.selected).length;

  if (visibleDates.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label className="text-xs">Meals ({selectedCount} selected)</Label>
      <div className="rounded-md border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_repeat(3,48px)] gap-0 bg-muted/50 px-2 py-1.5 text-xs font-medium text-muted-foreground">
          <span>Date</span>
          {MEAL_TYPES.map((m) => (
            <span key={m.type} className="text-center">
              {m.short}
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
              className={`grid grid-cols-[1fr_repeat(3,48px)] gap-0 items-center px-2 py-1.5 border-t text-xs ${
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
                    checked={isFullDay ? true : isChecked(date, meal.type)}
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
