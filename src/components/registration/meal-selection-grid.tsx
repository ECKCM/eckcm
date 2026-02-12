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

interface MealSelectionGridProps {
  startDate: string; // YYYY-MM-DD (check-in)
  endDate: string; // YYYY-MM-DD (check-out)
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

export function MealSelectionGrid({
  startDate,
  endDate,
  selections,
  onChange,
}: MealSelectionGridProps) {
  const dates = getDatesInRange(startDate, endDate);
  const isArrivalDay = (date: string) => date === startDate;
  const isDepartureDay = (date: string) => date === endDate;

  // Initialize default selections when dates change
  const initializeSelections = useCallback(() => {
    if (dates.length === 0) return;

    // Check if selections already exist for these dates
    const existingDates = new Set(selections.map((s) => s.date));
    const allDatesExist = dates.every((d) => existingDates.has(d));
    if (allDatesExist && selections.length > 0) return;

    // Generate defaults: middle days = all checked, arrival/departure = unchecked
    const newSelections: MealSelection[] = [];
    for (const date of dates) {
      const isFirst = date === startDate;
      const isLast = date === endDate;
      for (const meal of MEAL_TYPES) {
        // Middle days default to all checked
        // Arrival/departure days default to unchecked (partial selection)
        const defaultSelected = !isFirst && !isLast;
        // Preserve existing selection if available
        const existing = selections.find(
          (s) => s.date === date && s.mealType === meal.type
        );
        newSelections.push({
          date,
          mealType: meal.type,
          selected: existing !== undefined ? existing.selected : defaultSelected,
        });
      }
    }
    onChange(newSelections);
  }, [dates.join(","), startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (dates.length === 0) return null;

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
        {dates.map((date) => {
          const arrival = isArrivalDay(date);
          const departure = isDepartureDay(date);
          return (
            <div
              key={date}
              className="grid grid-cols-[1fr_repeat(3,48px)] gap-0 items-center px-2 py-1.5 border-t text-xs"
            >
              <span className="truncate">
                {formatDate(date)}
                {arrival && (
                  <span className="ml-1 text-muted-foreground">(Arr.)</span>
                )}
                {departure && (
                  <span className="ml-1 text-muted-foreground">(Dep.)</span>
                )}
              </span>
              {MEAL_TYPES.map((meal) => (
                <div key={meal.type} className="flex justify-center">
                  <Checkbox
                    checked={isChecked(date, meal.type)}
                    onCheckedChange={() => toggleMeal(date, meal.type)}
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
