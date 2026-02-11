"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BirthDatePickerProps {
  year: number | undefined;
  month: number | undefined;
  day: number | undefined;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onDayChange: (day: number) => void;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

const currentYear = new Date().getFullYear();

export function BirthDatePicker({
  year,
  month,
  day,
  onYearChange,
  onMonthChange,
  onDayChange,
}: BirthDatePickerProps) {
  const maxDays =
    year && month ? getDaysInMonth(year, month) : 31;

  return (
    <div className="space-y-2">
      <Label>Date of Birth</Label>
      <div className="grid grid-cols-3 gap-2">
        {/* Year - Input with validation */}
        <div>
          <Input
            type="number"
            placeholder="Year"
            min={currentYear - 120}
            max={currentYear}
            value={year ?? ""}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (!isNaN(v)) onYearChange(v);
            }}
          />
        </div>

        {/* Month - Dropdown */}
        <Select
          value={month?.toString()}
          onValueChange={(v) => onMonthChange(parseInt(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <SelectItem key={m} value={m.toString()}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Day - Dropdown (dynamic based on month/year) */}
        <Select
          value={day?.toString()}
          onValueChange={(v) => onDayChange(parseInt(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Day" />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: maxDays }, (_, i) => i + 1).map((d) => (
              <SelectItem key={d} value={d.toString()}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
