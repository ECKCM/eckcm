"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatPhoneNational } from "@/lib/utils/field-helpers";

export interface Country {
  code: string;
  dialCode: string;
  flag: string;
  label: string;
  maxDigits: number;
}

export const PHONE_COUNTRIES: Country[] = [
  { code: "US", dialCode: "+1", flag: "\u{1F1FA}\u{1F1F8}", label: "US", maxDigits: 10 },
  { code: "CA", dialCode: "+1", flag: "\u{1F1E8}\u{1F1E6}", label: "Canada", maxDigits: 10 },
  { code: "KR", dialCode: "+82", flag: "\u{1F1F0}\u{1F1F7}", label: "\uD55C\uAD6D", maxDigits: 11 },
  { code: "OTHER", dialCode: "", flag: "\u{1F310}", label: "Other", maxDigits: 0 },
];

export function getCountry(code: string): Country {
  return PHONE_COUNTRIES.find((c) => c.code === code) ?? PHONE_COUNTRIES[0];
}

interface PhoneInputProps {
  /** Formatted national number, e.g. "(212) 555-1234" */
  value: string;
  /** ISO country code: "US" | "CA" | "KR" */
  countryCode: string;
  onChange: (phone: string) => void;
  onCountryChange: (countryCode: string) => void;
  error?: boolean;
  className?: string;
  id?: string;
}

export function PhoneInput({
  value,
  countryCode,
  onChange,
  onCountryChange,
  error,
  className,
  id,
}: PhoneInputProps) {
  const country = getCountry(countryCode);

  const handleCountryChange = (code: string) => {
    onCountryChange(code);
  };

  const handlePhoneChange = (raw: string) => {
    if (country.code === "OTHER") {
      // Only allow digits for "Other"
      onChange(raw.replace(/[^\d+\-() ]/g, ""));
      return;
    }
    onChange(formatPhoneNational(raw, country.code));
  };

  const placeholder = country.code === "OTHER"
    ? "Enter phone number"
    : country.code === "KR"
      ? "010-0000-0000"
      : "(000) 000-0000";

  return (
    <div className={cn("flex gap-1.5", className)}>
      <Select value={countryCode} onValueChange={handleCountryChange}>
        <SelectTrigger
          className={cn("w-[108px] shrink-0", error && "border-destructive")}
          id={id ? `${id}-country` : undefined}
        >
          <SelectValue>
            {country.flag} {country.dialCode || country.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PHONE_COUNTRIES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.flag} {c.label}{c.dialCode ? ` (${c.dialCode})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        type="tel"
        value={value}
        onChange={(e) => handlePhoneChange(e.target.value)}
        placeholder={placeholder}
        className={cn(error && "border-destructive")}
      />
    </div>
  );
}
