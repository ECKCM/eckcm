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
import { Card, CardContent } from "@/components/ui/card";
import { Coffee, Sun, Moon, Loader2, Download, Printer } from "lucide-react";

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

type MealKey = "breakfast" | "lunch" | "dinner";

interface DayReport {
  date: string;
  meals: Record<MealKey, Tally>;
  dayTotals: Tally;
  manual: Record<MealKey, number | null>;
  dayManual: number | null;
}

interface Report {
  eventStartDate: string | null;
  eventEndDate: string | null;
  days: DayReport[];
  grand: Record<MealKey, Tally>;
  grandTotals: Tally;
  grandManual: number | null;
}

const MEALS = [
  { key: "breakfast", label: "Breakfast", Icon: Coffee },
  { key: "lunch", label: "Lunch", Icon: Sun },
  { key: "dinner", label: "Dinner", Icon: Moon },
] as const;

// Eastern Time basis — the gathering is on the US East Coast.
function fmtShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtLongDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function FullMealReportClient({ events }: { events: EventOption[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ eventId });
      const res = await fetch(`/api/checkin/full-meal-report?${params}`, {
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
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedEvent = events.find((e) => e.id === eventId);
  const hasData = !!report && report.grandTotals.total > 0;

  const downloadCsv = () => {
    if (!report) return;
    const csvEscape = (v: string) =>
      /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

    const lines: string[] = [];
    if (selectedEvent) {
      lines.push(
        ["Event", csvEscape(`${selectedEvent.name_en} (${selectedEvent.year})`)].join(
          ","
        )
      );
    }
    if (report.eventStartDate && report.eventEndDate) {
      lines.push(
        [
          "Range",
          csvEscape(
            `${fmtLongDate(report.eventStartDate)} – ${fmtLongDate(report.eventEndDate)}`
          ),
        ].join(",")
      );
    }
    lines.push("");

    // One row per day: each meal's total plus that day's tier breakdown.
    const headers = [
      "Date",
      "Breakfast",
      "Lunch",
      "Dinner",
      "General",
      "Youth",
      "Free",
      "Unknown",
      "Day Total",
      "UPJ Staff Count",
    ];
    lines.push(headers.join(","));
    for (const d of report.days) {
      lines.push(
        [
          d.date,
          d.meals.breakfast.total,
          d.meals.lunch.total,
          d.meals.dinner.total,
          d.dayTotals.general,
          d.dayTotals.youth,
          d.dayTotals.free,
          d.dayTotals.unknown,
          d.dayTotals.total,
          d.dayManual === null ? "" : d.dayManual,
        ].join(",")
      );
    }
    const g = report.grand;
    const gt = report.grandTotals;
    lines.push(
      [
        "All days",
        g.breakfast.total,
        g.lunch.total,
        g.dinner.total,
        gt.general,
        gt.youth,
        gt.free,
        gt.unknown,
        gt.total,
        report.grandManual === null ? "" : report.grandManual,
      ].join(",")
    );

    const body = "﻿" + lines.join("\r\n") + "\r\n";
    const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `full_meal_report_${eventId.slice(0, 8)}.csv`;
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
        <div className="ml-auto flex items-end gap-2">
          <Button variant="outline" onClick={downloadCsv} disabled={!hasData}>
            <Download className="mr-1.5 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!report}>
            <Printer className="mr-1.5 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {/* Print header — only visible when printing. */}
      <div className="hidden print:block">
        <h2 className="text-xl font-bold">Full Meal Report</h2>
        <p className="text-sm">
          {selectedEvent
            ? `${selectedEvent.name_en} (${selectedEvent.year})`
            : ""}
          {report?.eventStartDate && report?.eventEndDate
            ? ` · ${fmtLongDate(report.eventStartDate)} – ${fmtLongDate(report.eventEndDate)}`
            : ""}
        </p>
      </div>

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
      ) : !hasData ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No meals recorded for this event.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Grand-total summary cards — one per meal across all days. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 print:hidden">
            {MEALS.map(({ key, label, Icon }) => {
              const t = report!.grand[key];
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
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Per-day detail table (used for both screen and print). */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Breakfast</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Lunch</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Dinner</th>
                  <th className="px-4 py-2.5 text-right font-semibold">General</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Youth</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Free</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Unknown</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Day Total</th>
                  <th className="px-4 py-2.5 text-right font-semibold">UPJ Staff</th>
                </tr>
              </thead>
              <tbody>
                {report!.days.map((d) => (
                  <tr key={d.date} className="border-t">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium">
                      {fmtShortDate(d.date)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {d.meals.breakfast.total}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {d.meals.lunch.total}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {d.meals.dinner.total}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {d.dayTotals.general}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {d.dayTotals.youth}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {d.dayTotals.free}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {d.dayTotals.unknown}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                      {d.dayTotals.total}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {d.dayManual ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/30 font-semibold">
                  <td className="px-4 py-2.5">All days</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {report!.grand.breakfast.total}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {report!.grand.lunch.total}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {report!.grand.dinner.total}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {report!.grandTotals.general}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {report!.grandTotals.youth}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {report!.grandTotals.free}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {report!.grandTotals.unknown}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {report!.grandTotals.total}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {report!.grandManual ?? "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {report!.grandTotals.unknown > 0 && (
            <p className="text-xs text-muted-foreground print:hidden">
              &ldquo;Unknown&rdquo; = no birth date on file, so the age tier
              couldn&rsquo;t be derived.
            </p>
          )}
          <p className="text-xs text-muted-foreground print:hidden">
            Totals match the Daily Meal Report (real meal scans only, with admin
            adjustments applied). Edit a day&rsquo;s counts on the Daily Meal
            Report.
          </p>
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
