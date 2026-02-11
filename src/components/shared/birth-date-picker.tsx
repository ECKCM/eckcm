"use client";

import { useState } from "react";
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
  onYearChange: (year: number | undefined) => void;
  onMonthChange: (month: number) => void;
  onDayChange: (day: number) => void;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

const currentYear = new Date().getFullYear();
const minYear = currentYear - 120;

export function BirthDatePicker({
  year,
  month,
  day,
  onYearChange,
  onMonthChange,
  onDayChange,
}: BirthDatePickerProps) {
  const [yearInput, setYearInput] = useState(year?.toString() ?? "");
  const [yearError, setYearError] = useState("");

  const maxDays = year && month ? getDaysInMonth(year, month) : 31;

  const handleYearChange = (raw: string) => {
    // Only allow digits, max 4 characters
    const cleaned = raw.replace(/\D/g, "").slice(0, 4);
    setYearInput(cleaned);

    if (cleaned === "") {
      setYearError("");
      onYearChange(undefined);
      return;
    }

    const v = parseInt(cleaned);
    if (cleaned.length === 4) {
      if (v < minYear || v > currentYear) {
        setYearError(`${minYear}–${currentYear}`);
      } else {
        setYearError("");
      }
      onYearChange(v);
    } else {
      // Still typing, clear error but don't validate yet
      setYearError("");
      onYearChange(undefined);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Date of Birth *</Label>
      <div className="grid grid-cols-3 gap-2">
        {/* Year - Input with live validation */}
        <div className="space-y-1">
          <Input
            type="text"
            inputMode="numeric"
            placeholder="Year"
            maxLength={4}
            value={yearInput}
            onChange={(e) => handleYearChange(e.target.value)}
          />
          {yearError && (
            <p className="text-xs text-destructive">{yearError}</p>
          )}
        </div>

        {/* Month - Dropdown */}
        <Select
          value={month?.toString()}
          onValueChange={(v) => onMonthChange(parseInt(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <SelectItem key={m} value={m.toString()}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Day - Dropdown with max height */}
        <Select
          value={day?.toString()}
          onValueChange={(v) => onDayChange(parseInt(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Day" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
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
