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
import { Coffee, Sun, Moon, Loader2, Download, Printer } from "lucide-react";
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

interface SessionBreakdown {
  id: string | null;
  label: string;
  startedAt: string | null;
  count: number;
}

interface Report {
  date: string;
  meals: { breakfast: Tally; lunch: Tally; dinner: Tally };
  totals: Tally;
  sessions: {
    breakfast: SessionBreakdown[];
    lunch: SessionBreakdown[];
    dinner: SessionBreakdown[];
  };
  manual: { breakfast: number | null; lunch: number | null; dinner: number | null };
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

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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

export function DailyMealReportClient({ events }: { events: EventOption[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [date, setDate] = useState(todayISO());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // UPJ staff manual count input drafts, keyed by meal. Seeded from the saved
  // values whenever a report loads; "" means not entered.
  const [manualDraft, setManualDraft] = useState<Record<MealKey, string>>({
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
      const res = await fetch(`/api/checkin/daily-meal-report?${params}`, {
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

  // Seed the manual-count inputs from the loaded report.
  useEffect(() => {
    if (!report) return;
    setManualDraft({
      breakfast: report.manual.breakfast?.toString() ?? "",
      lunch: report.manual.lunch?.toString() ?? "",
      dinner: report.manual.dinner?.toString() ?? "",
    });
  }, [report]);

  const saveManual = useCallback(
    async (mealKey: MealKey, mealType: string) => {
      if (!eventId || !date) return;
      const raw = manualDraft[mealKey].trim();
      // Don't re-save if unchanged from what's stored.
      const current = report?.manual[mealKey] ?? null;
      const next = raw === "" ? null : Math.trunc(Number(raw));
      if (raw !== "" && (!Number.isFinite(next as number) || (next as number) < 0)) {
        toast.error("Enter a whole number (0 or more)");
        return;
      }
      if (next === current) return;
      setSavingMeal(mealKey);
      try {
        const res = await fetch("/api/checkin/daily-meal-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            date,
            mealType,
            count: raw === "" ? null : next,
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(d.error || "Failed to save");
          return;
        }
        // Reflect the saved value locally without a full reload.
        setReport((prev) =>
          prev
            ? { ...prev, manual: { ...prev.manual, [mealKey]: d.count ?? null } }
            : prev
        );
        toast.success(
          d.count === null
            ? `Cleared UPJ count for ${mealKey}`
            : `Saved UPJ count: ${d.count}`
        );
      } catch {
        toast.error("Network error");
      } finally {
        setSavingMeal(null);
      }
    },
    [eventId, date, manualDraft, report]
  );

  const selectedEvent = events.find((e) => e.id === eventId);

  const downloadCsv = () => {
    if (!report) return;
    const csvEscape = (v: string) =>
      /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

    const lines: string[] = [];
    // Report metadata (date is requested here so an exported file is
    // self-identifying without relying on the filename).
    if (selectedEvent) {
      lines.push(
        ["Event", csvEscape(`${selectedEvent.name_en} (${selectedEvent.year})`)].join(",")
      );
    }
    lines.push(["Date", csvEscape(fmtLongDate(date))].join(","));
    lines.push(["Date (ISO)", date].join(","));
    lines.push("");

    const headers = [
      "Meal",
      "General",
      "Youth",
      "Free",
      "Unknown",
      "Total",
      "UPJ Staff Count",
      "Difference",
    ];
    lines.push(headers.join(","));
    for (const { key, label } of MEALS) {
      const t = report.meals[key];
      const upj = report.manual[key];
      const diff = upj === null ? "" : upj - t.total;
      lines.push(
        [
          label,
          t.general,
          t.youth,
          t.free,
          t.unknown,
          t.total,
          upj === null ? "" : upj,
          diff,
        ].join(",")
      );
    }
    const g = report.totals;
    const upjAll = MEALS.every(({ key }) => report.manual[key] === null)
      ? null
      : MEALS.reduce((sum, { key }) => sum + (report.manual[key] ?? 0), 0);
    lines.push(
      [
        "All meals",
        g.general,
        g.youth,
        g.free,
        g.unknown,
        g.total,
        upjAll === null ? "" : upjAll,
        upjAll === null ? "" : upjAll - g.total,
      ].join(",")
    );

    // Per-meal session breakdown (only where a meal spans multiple sessions).
    const sessionLines: string[] = [];
    for (const { key, label } of MEALS) {
      const list = report.sessions[key];
      if (list.length <= 1) continue;
      for (const s of list) {
        const when = s.startedAt ? `Started ${fmtTime(s.startedAt)}` : s.label;
        sessionLines.push([csvEscape(label), csvEscape(when), s.count].join(","));
      }
    }
    if (sessionLines.length) {
      lines.push("");
      lines.push("Session breakdown");
      lines.push(["Meal", "Scan Session", "Count"].join(","));
      lines.push(...sessionLines);
    }

    const body = "﻿" + lines.join("\r\n") + "\r\n";
    const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily_meal_report_${eventId.slice(0, 8)}_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Controls — hidden when printing. */}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
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
        <div className="ml-auto flex items-end gap-2">
          <Button
            variant="outline"
            onClick={downloadCsv}
            disabled={!report || report.totals.total === 0}
          >
            <Download className="mr-1.5 h-4 w-4" /> CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => window.print()}
            disabled={!report}
          >
            <Printer className="mr-1.5 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {/* Print header — only visible when printing. */}
      <div className="hidden print:block">
        <h2 className="text-xl font-bold">Daily Meal Report</h2>
        <p className="text-sm">
          {selectedEvent ? `${selectedEvent.name_en} (${selectedEvent.year}) · ` : ""}
          {fmtLongDate(date)}
        </p>
      </div>

      <p className="text-2xl font-bold tracking-tight sm:text-3xl print:hidden">
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
      ) : !report || report.totals.total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No meals recorded for this date.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Per-meal summary cards. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 print:hidden">
            {MEALS.map(({ key, label, Icon, type }) => {
              const t = report.meals[key];
              return (
                <Card key={key}>
                  <CardContent className="py-5">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Icon className="h-5 w-5" />
                      <span className="font-medium text-foreground">{label}</span>
                      <span className="ml-auto text-3xl font-bold tabular-nums text-foreground">
                        {t.total}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                      <TierMini label="General" value={t.general} />
                      <TierMini label="Youth" value={t.youth} />
                      <TierMini label="Free" value={t.free} />
                    </div>
                    {report.sessions[key].length > 1 && (
                      <div className="mt-3 border-t pt-2">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          By scan session
                        </p>
                        <ul className="space-y-0.5">
                          {report.sessions[key].map((s, i) => (
                            <li
                              key={s.id ?? `none-${i}`}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <span className="truncate text-muted-foreground">
                                {s.startedAt
                                  ? `Started ${fmtTime(s.startedAt)}`
                                  : s.label}
                              </span>
                              <span className="shrink-0 font-medium tabular-nums">
                                {s.count}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* UPJ staff manual count — optional. Saved per meal on
                        blur / Enter; empty clears it. */}
                    <div className="mt-3 border-t pt-3">
                      <label
                        htmlFor={`upj-${key}`}
                        className="mb-1 block text-xs font-medium text-muted-foreground"
                      >
                        UPJ Staff Count
                      </label>
                      <div className="flex items-center gap-2">
                        <Input
                          id={`upj-${key}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          placeholder="—"
                          value={manualDraft[key]}
                          onChange={(e) =>
                            setManualDraft((d) => ({ ...d, [key]: e.target.value }))
                          }
                          onBlur={() => saveManual(key, type)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          className="h-9 w-28 tabular-nums"
                        />
                        {savingMeal === key && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        {report.manual[key] !== null &&
                          report.manual[key] !== t.total && (
                            <span
                              className={`text-xs font-medium ${
                                (report.manual[key] as number) > t.total
                                  ? "text-amber-600"
                                  : "text-red-600"
                              }`}
                            >
                              {(report.manual[key] as number) > t.total ? "+" : ""}
                              {(report.manual[key] as number) - t.total} vs system
                            </span>
                          )}
                        {report.manual[key] !== null &&
                          report.manual[key] === t.total && (
                            <span className="text-xs font-medium text-green-600">
                              Matches
                            </span>
                          )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Detail table (used for both screen and print). */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Meal</th>
                  <th className="px-4 py-2.5 text-right font-semibold">General</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Youth</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Free</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Unknown</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-4 py-2.5 text-right font-semibold">UPJ Staff</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Diff</th>
                </tr>
              </thead>
              <tbody>
                {MEALS.map(({ key, label }) => {
                  const t = report.meals[key];
                  const upj = report.manual[key];
                  const diff = upj === null ? null : upj - t.total;
                  return (
                    <tr key={key} className="border-t">
                      <td className="px-4 py-2.5 font-medium">{label}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{t.general}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{t.youth}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{t.free}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {t.unknown}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                        {t.total}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {upj ?? "—"}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums ${
                          diff === null
                            ? "text-muted-foreground"
                            : diff === 0
                              ? "text-green-600"
                              : diff > 0
                                ? "text-amber-600"
                                : "text-red-600"
                        }`}
                      >
                        {diff === null ? "—" : diff > 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {(() => {
                  const upjAll = MEALS.every(({ key }) => report.manual[key] === null)
                    ? null
                    : MEALS.reduce((sum, { key }) => sum + (report.manual[key] ?? 0), 0);
                  const diffAll = upjAll === null ? null : upjAll - report.totals.total;
                  return (
                    <tr className="border-t-2 bg-muted/30 font-semibold">
                      <td className="px-4 py-2.5">All meals</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{report.totals.general}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{report.totals.youth}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{report.totals.free}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {report.totals.unknown}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{report.totals.total}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {upjAll ?? "—"}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums ${
                          diffAll === null
                            ? "text-muted-foreground"
                            : diffAll === 0
                              ? "text-green-600"
                              : diffAll > 0
                                ? "text-amber-600"
                                : "text-red-600"
                        }`}
                      >
                        {diffAll === null ? "—" : diffAll > 0 ? `+${diffAll}` : diffAll}
                      </td>
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          </div>
          {report.totals.unknown > 0 && (
            <p className="text-xs text-muted-foreground print:hidden">
              &ldquo;Unknown&rdquo; = no birth date on file, so the age tier
              couldn&rsquo;t be derived.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TierMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/40 py-1.5">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
