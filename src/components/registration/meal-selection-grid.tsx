"use client";

import { useMemo, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { MealSelection } from "@/lib/types/registration";
import type { MealType } from "@/lib/types/database";
import { formatCurrency } from "@/lib/utils/formatters";

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
  // Optional pricing
  perMealPriceCents?: number;
  fullDayPriceCents?: number;
  tierLabel?: string;
  // Admin mode: bypass the "full-day always selected" rule so admins can
  // override any meal (e.g. retroactive opt-outs after check-in).
  adminOverride?: boolean;
  // Display-only mode. Renders the grid but disables every checkbox and
  // skips the auto-sync that would otherwise push defaults back to the
  // parent. Used by admin tools to require an explicit "Edit" click.
  readOnly?: boolean;
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
  existing: MealSelection[],
  adminOverride: boolean
): MealSelection[] {
  const map = new Map<string, boolean>();
  for (const s of existing) map.set(`${s.date}|${s.mealType}`, s.selected);

  return visibleDates.flatMap((date) => {
    const dayType = getDayType(date, startDate, endDate, eventStartDate, eventEndDate);
    return MEAL_TYPES.map((meal) => {
      const key = `${date}|${meal.type}`;
      // Admin: trust whatever's in `existing` for every day (default true if absent).
      // User wizard: full days always selected; partial days use existing or default true.
      const selected = adminOverride
        ? (map.get(key) ?? true)
        : dayType === "fullday"
          ? true
          : (map.get(key) ?? true);
      return { date, mealType: meal.type, selected };
    });
  });
}

function formatPrice(cents: number): string {
  return formatCurrency(cents);
}

export function MealSelectionGrid({
  startDate,
  endDate,
  eventStartDate,
  eventEndDate,
  selections,
  onChange,
  perMealPriceCents,
  fullDayPriceCents,
  tierLabel,
  adminOverride = false,
  readOnly = false,
}: MealSelectionGridProps) {
  const showPricing = perMealPriceCents != null;

  const visibleDates = useMemo(
    () =>
      getDatesInRange(startDate, endDate).filter(
        (d) => getDayType(d, startDate, endDate, eventStartDate, eventEndDate) !== "no_meal"
      ),
    [startDate, endDate, eventStartDate, eventEndDate]
  );

  // Always-complete selections: fills gaps in props with defaults
  const effective = useMemo(
    () => buildSelections(visibleDates, startDate, endDate, eventStartDate, eventEndDate, selections, adminOverride),
    [visibleDates, startDate, endDate, eventStartDate, eventEndDate, selections, adminOverride]
  );

  // Sync to parent on mount (if empty) or when dates change (missing entries)
  useEffect(() => {
    if (readOnly) return; // Don't write back from display-only mounts.
    if (visibleDates.length === 0) return;
    const parentDates = new Set(selections.map((s) => s.date));
    if (selections.length === 0 || !visibleDates.every((d) => parentDates.has(d))) {
      onChange(effective);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleDates]);

  const toggleMeal = (date: string, mealType: MealType) => {
    if (readOnly) return;
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

  const totalCost = useMemo(() => {
    if (!showPricing || perMealPriceCents === 0) return 0;
    let total = 0;
    for (const date of visibleDates) {
      const count = MEAL_TYPES.filter((m) => isChecked(date, m.type)).length;
      if (count === 3 && fullDayPriceCents != null) {
        total += Math.min(fullDayPriceCents, 3 * perMealPriceCents!);
      } else {
        total += count * perMealPriceCents!;
      }
    }
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleDates, effective, perMealPriceCents, fullDayPriceCents]);

  if (visibleDates.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Meals ({selectedCount} selected)</Label>
        {showPricing && tierLabel && (
          perMealPriceCents === 0 ? (
            <span className="text-xs font-medium text-green-600">{tierLabel}: Free</span>
          ) : (
            <span className="text-xs font-semibold tabular-nums">
              Meal Total: {formatPrice(totalCost)}
            </span>
          )
        )}
      </div>
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
              {MEAL_TYPES.map((meal) => {
                // Admin can toggle anything; users can't unset full-day meals.
                const lockFullDay = isFullDay && !adminOverride;
                const isDisabled = readOnly || lockFullDay;
                return (
                  <div key={meal.type} className="flex justify-center">
                    <Checkbox
                      checked={isChecked(date, meal.type)}
                      onCheckedChange={() => toggleMeal(date, meal.type)}
                      disabled={isDisabled}
                      className={isDisabled ? "opacity-50" : ""}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
