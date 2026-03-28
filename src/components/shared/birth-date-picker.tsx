"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

interface BirthDatePickerProps {
  year: number | undefined;
  month: number | undefined;
  day: number | undefined;
  onYearChange: (year: number | undefined) => void;
  onMonthChange: (month: number) => void;
  onDayChange: (day: number) => void;
  labelClassName?: string;
  error?: boolean;
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
  labelClassName,
  error,
}: BirthDatePickerProps) {
  const { t } = useI18n();
  const [yearInput, setYearInput] = useState(year?.toString() ?? "");
  const [yearError, setYearError] = useState("");

  // Sync internal yearInput when year prop changes externally (e.g. auto-fill from profile)
  useEffect(() => {
    const propStr = year?.toString() ?? "";
    setYearInput(propStr);
    setYearError("");
  }, [year]);

  const maxDays = year && month ? getDaysInMonth(year, month) : 31;

  useEffect(() => {
    if (year && month && day && day > maxDays) {
      onDayChange(maxDays);
    }
  }, [day, maxDays, month, onDayChange, year]);

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
        onYearChange(undefined);
      } else {
        setYearError("");
        onYearChange(v);
      }
    } else {
      // Still typing, clear error but don't validate yet
      setYearError("");
      onYearChange(undefined);
    }
  };

  const age = year && month && day
    ? (() => {
        const today = new Date();
        const birthDate = new Date(year, month - 1, day);
        let a = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          a--;
        }
        return a >= 0 && a <= 150 ? a : null;
      })()
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Label className={labelClassName}>{t("profile.birthDateLegal")} <span className="text-destructive">*</span></Label>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="text-muted-foreground hover:text-foreground">
              <Info className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="text-xs">
            We collect your date of birth to determine your appropriate room assignment, calculate accurate meal pricing, and assign you to the correct department or group for this event. This information helps us coordinate travel logistics, dietary accommodations, and group organization efficiently. Your date of birth is securely stored, used only for these stated purposes, and never sold to third parties. It may be shared with authorized event organizers only as needed to support your participation. Participants under age 13 require parental consent in accordance with applicable U.S. regulations.
          </PopoverContent>
        </Popover>
        {age !== null && <span className="text-xs text-muted-foreground">{t("profile.age")}: {age}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {/* Month - Dropdown */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("profile.monthLabel")}</Label>
          <Select
            value={month !== undefined ? month.toString() : ""}
            onValueChange={(v) => onMonthChange(parseInt(v))}
          >
            <SelectTrigger className={error ? "border-destructive" : ""}>
              <SelectValue placeholder={t("profile.monthLabel")} />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={m.toString()}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Day - Dropdown */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("profile.dayLabel")}</Label>
          <Select
            value={day !== undefined ? day.toString() : ""}
            onValueChange={(v) => onDayChange(parseInt(v))}
          >
            <SelectTrigger className={error ? "border-destructive" : ""}>
              <SelectValue placeholder={t("profile.dayLabel")} />
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

        {/* Year - Input with live validation */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("profile.yearLabel")}</Label>
          <Input
            type="text"
            inputMode="numeric"
            placeholder={t("profile.yearLabel")}
            maxLength={4}
            autoComplete="off"
            value={yearInput}
            onChange={(e) => handleYearChange(e.target.value)}
            className={error ? "border-destructive" : ""}
          />
          {yearError && (
            <p className="text-xs text-destructive">{yearError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
