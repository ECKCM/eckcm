"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Coffee, Sun, Moon, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
  startDate: string | null;
  endDate: string | null;
}

interface Tally {
  total: number;
  general: number;
  youth: number;
  free: number;
  unknown: number;
}

interface Adjustment {
  value: number;
  note: string | null;
}

interface Report {
  date: string;
  meals: { breakfast: Tally; lunch: Tally; dinner: Tally };
  adjustments: { breakfast: Adjustment; lunch: Adjustment; dinner: Adjustment };
}

type MealKey = "breakfast" | "lunch" | "dinner";

const MEALS = [
  { key: "breakfast", label: "Breakfast", Icon: Coffee, type: "BREAKFAST" },
  { key: "lunch", label: "Lunch", Icon: Sun, type: "LUNCH" },
  { key: "dinner", label: "Dinner", Icon: Moon, type: "DINNER" },
] as const;

// Eastern Time basis — the gathering is on the US East Coast.
function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function fmtLongDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function MealScanCountsClient({ events }: { events: EventOption[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [date, setDate] = useState(todayISO());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-meal input drafts for the adjustment value. "" / "-" mid-typing is fine;
  // parsed on save. Seeded from the saved report whenever it loads.
  const [draft, setDraft] = useState<Record<MealKey, string>>({
    breakfast: "",
    lunch: "",
    dinner: "",
  });
  const [savingMeal, setSavingMeal] = useState<MealKey | null>(null);

  const load = useCallback(async () => {
    if (!eventId || !date) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ eventId, date });
      const res = await fetch(`/api/admin/meal-scan-adjustments?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || `Failed to load (${res.status})`);
        setReport(null);
        return;
      }
      setReport((await res.json()) as Report);
    } catch {
      setError("Network error");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [eventId, date]);

  useEffect(() => {
    load();
  }, [load]);

  // Seed the adjustment inputs from the loaded report. 0 shows as empty.
  useEffect(() => {
    if (!report) return;
    setDraft({
      breakfast: report.adjustments.breakfast.value
        ? String(report.adjustments.breakfast.value)
        : "",
      lunch: report.adjustments.lunch.value
        ? String(report.adjustments.lunch.value)
        : "",
      dinner: report.adjustments.dinner.value
        ? String(report.adjustments.dinner.value)
        : "",
    });
  }, [report]);

  const saveAdjustment = useCallback(
    async (mealKey: MealKey, mealType: string) => {
      if (!eventId || !date) return;
      const raw = draft[mealKey].trim();
      const current = report?.adjustments[mealKey].value ?? 0;
      const next = raw === "" || raw === "-" ? 0 : Math.trunc(Number(raw));
      if (raw !== "" && raw !== "-" && !Number.isFinite(next)) {
        toast.error("Enter a whole number (may be negative)");
        return;
      }
      if (next === current) return;
      setSavingMeal(mealKey);
      try {
        const res = await fetch("/api/admin/meal-scan-adjustments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, date, mealType, adjustment: next }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(d.error || "Failed to save");
          return;
        }
        setReport((prev) =>
          prev
            ? {
                ...prev,
                adjustments: {
                  ...prev.adjustments,
                  [mealKey]: { value: d.adjustment ?? 0, note: null },
                },
              }
            : prev
        );
        toast.success(
          next === 0
            ? `Cleared adjustment for ${mealKey}`
            : `Saved adjustment: ${next > 0 ? "+" : ""}${next}`
        );
      } catch {
        toast.error("Network error");
      } finally {
        setSavingMeal(null);
      }
    },
    [eventId, date, draft, report]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Event</label>
          <Select value={eventId} onValueChange={setEventId}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Select event" />
            </SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name_en} ({e.year})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
            className="h-10 w-[180px] rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <Button variant="outline" onClick={() => setDate(todayISO())}>
          Today
        </Button>
      </div>

      <p className="text-2xl font-bold tracking-tight sm:text-3xl">
        {fmtLongDate(date)}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : !report ? null : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {MEALS.map(({ key, label, Icon, type }) => {
            const t = report.meals[key];
            const adj = report.adjustments[key].value;
            const adjusted = Math.max(0, t.total + adj);
            return (
              <Card key={key}>
                <CardContent className="py-5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Icon className="h-5 w-5" />
                    <span className="font-medium text-foreground">{label}</span>
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">System count</span>
                      <span className="text-lg font-semibold tabular-nums">
                        {t.total}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`adj-${key}`}
                        className="text-muted-foreground"
                      >
                        Adjustment
                      </label>
                      <div className="flex items-center gap-2">
                        {savingMeal === key && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        <Input
                          id={`adj-${key}`}
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          value={draft[key]}
                          onChange={(e) => {
                            const v = e.target.value;
                            // Allow only an optional leading "-" and digits.
                            if (/^-?\d*$/.test(v)) {
                              setDraft((d) => ({ ...d, [key]: v }));
                            }
                          }}
                          onBlur={() => saveAdjustment(key, type)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          className="h-9 w-24 text-right tabular-nums"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t pt-3">
                    <span className="text-sm font-medium">Adjusted total</span>
                    <span className="text-2xl font-bold tabular-nums">
                      {adjusted}
                    </span>
                  </div>
                  {adj !== 0 && (
                    <p
                      className={`mt-1 text-right text-xs font-medium ${
                        adj > 0 ? "text-amber-600" : "text-red-600"
                      }`}
                    >
                      {adj > 0 ? "+" : ""}
                      {adj} vs system
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
