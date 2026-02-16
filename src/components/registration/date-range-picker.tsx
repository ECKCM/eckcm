"use client";

import { useState, useRef } from "react";
import { format } from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

interface DateRangePickerProps {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  eventStartDate: string; // YYYY-MM-DD
  eventEndDate: string; // YYYY-MM-DD
  nightsCount: number;
  onDatesChange: (startDate: string, endDate: string, nights: number) => void;
}

function toDate(s: string): Date {
  return new Date(s + "T00:00:00");
}

function toYMD(d: Date): string {
  return d.toISOString().split("T")[0];
}

function calcNights(from: string, to: string): number {
  return Math.max(
    0,
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
  );
}

export function DateRangePicker({
  startDate,
  endDate,
  eventStartDate,
  eventEndDate,
  nightsCount,
  onDatesChange,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  // Tracks the "from" date during a two-click selection
  const pickingFrom = useRef<string | null>(null);

  const evStart = toDate(eventStartDate);
  const evEnd = toDate(eventEndDate);

  // Show only "from" highlighted while picking, full range otherwise
  const selected: DateRange = pickingFrom.current
    ? { from: toDate(pickingFrom.current), to: undefined }
    : {
        from: startDate ? toDate(startDate) : undefined,
        to: endDate ? toDate(endDate) : undefined,
      };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) pickingFrom.current = null;
  };

  // onSelect signature: (range, triggerDate, modifiers, event)
  // triggerDate = the exact date the user clicked
  const handleSelect = (
    _range: DateRange | undefined,
    triggerDate: Date
  ) => {
    const clicked = toYMD(triggerDate);

    if (!pickingFrom.current) {
      // First click — set as check-in, wait for check-out
      pickingFrom.current = clicked;
      onDatesChange(clicked, clicked, 0);
      return;
    }

    // Second click — complete the range
    let from = pickingFrom.current;
    let to = clicked;
    // Swap if user clicked before the from date
    if (from > to) [from, to] = [to, from];

    onDatesChange(from, to, calcNights(from, to));
    pickingFrom.current = null;
    setOpen(false);
  };

  const shiftDate = (
    current: string,
    days: number,
    min: string,
    max: string
  ): string | null => {
    const d = toDate(current);
    d.setDate(d.getDate() + days);
    const ymd = toYMD(d);
    if (ymd < min || ymd > max) return null;
    return ymd;
  };

  const shiftStart = (days: number) => {
    if (!startDate || !endDate) return;
    const next = shiftDate(startDate, days, eventStartDate, endDate);
    if (next) onDatesChange(next, endDate, calcNights(next, endDate));
  };

  const shiftEnd = (days: number) => {
    if (!startDate || !endDate) return;
    const next = shiftDate(endDate, days, startDate, eventEndDate);
    if (next) onDatesChange(startDate, next, calcNights(startDate, next));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Check-in</Label>
        <Label>Check-out</Label>
      </div>
      <Popover open={open} onOpenChange={handleOpenChange}>
        {/* Trigger — date header bar */}
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center rounded-lg border bg-card px-3 py-2.5 text-sm shadow-sm transition-colors hover:bg-accent/50",
              open && "ring-2 ring-ring"
            )}
          >
            <CalendarIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">
              {startDate
                ? format(toDate(startDate), "EEE, MMM d")
                : "Check-in"}
            </span>
            <span className="flex-1 text-center text-muted-foreground">—</span>
            <span className="font-medium">
              {endDate ? format(toDate(endDate), "EEE, MMM d") : "Check-out"}
            </span>
          </button>
        </PopoverTrigger>

        {/* Popover — header + calendar */}
        <PopoverContent className="min-w-[340px] overflow-hidden p-0" align="center" sideOffset={4}>
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <div className="flex items-center gap-1">
              <CalendarIcon className="mr-1.5 size-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">
                {startDate
                  ? format(toDate(startDate), "EEE, MMM d")
                  : "Check-in"}
              </span>
              <button
                type="button"
                onClick={() => shiftStart(-1)}
                className="rounded p-0.5 hover:bg-muted"
              >
                <ChevronLeft className="size-3.5 text-muted-foreground" />
              </button>
              <button
                type="button"
                onClick={() => shiftStart(1)}
                className="rounded p-0.5 hover:bg-muted"
              >
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium">
                {endDate ? format(toDate(endDate), "EEE, MMM d") : "Check-out"}
              </span>
              <button
                type="button"
                onClick={() => shiftEnd(-1)}
                className="rounded p-0.5 hover:bg-muted"
              >
                <ChevronLeft className="size-3.5 text-muted-foreground" />
              </button>
              <button
                type="button"
                onClick={() => shiftEnd(1)}
                className="rounded p-0.5 hover:bg-muted"
              >
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {pickingFrom.current && (
            <p className="px-4 pt-2 text-xs text-muted-foreground">
              Now select check-out date
            </p>
          )}

          <div className="flex justify-center">
            <Calendar
              mode="range"
              defaultMonth={evStart}
              selected={selected}
              onSelect={handleSelect}
              disabled={[{ before: evStart }, { after: evEnd }]}
              numberOfMonths={1}
              className="p-4"
            />
          </div>
        </PopoverContent>
      </Popover>
      {nightsCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {nightsCount} night{nightsCount > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
