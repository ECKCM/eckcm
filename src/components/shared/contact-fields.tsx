"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/shared/phone-input";

/**
 * Reusable contact form fields — Legal Name, Email, Phone, Church.
 *
 * Each field is a self-contained Label + control with a plain `value`/`onChange`
 * interface so it drops into any form. Labels/placeholders are props (pass i18n
 * strings from the caller) so these stay locale-agnostic. PhoneField wraps the
 * richer PhoneInput and manages its own country-code state internally, exposing
 * only the formatted national number.
 */

interface BaseFieldProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** Appended in muted parentheses after the label, e.g. "(Optional)". */
  optionalLabel?: string;
  placeholder?: string;
  id?: string;
  maxLength?: number;
  required?: boolean;
}

function FieldLabel({
  htmlFor,
  label,
  optionalLabel,
  required,
}: {
  htmlFor?: string;
  label: string;
  optionalLabel?: string;
  required?: boolean;
}) {
  return (
    <Label htmlFor={htmlFor}>
      {label}
      {required && <span className="ml-0.5 text-destructive">*</span>}
      {optionalLabel && (
        <span className="ml-1 text-xs text-muted-foreground">({optionalLabel})</span>
      )}
    </Label>
  );
}

export function LegalNameField({
  value,
  onChange,
  label,
  optionalLabel,
  placeholder,
  id = "legal-name",
  maxLength = 200,
  required,
}: BaseFieldProps) {
  return (
    <div className="space-y-1">
      <FieldLabel htmlFor={id} label={label} optionalLabel={optionalLabel} required={required} />
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="name"
      />
    </div>
  );
}

export function EmailField({
  value,
  onChange,
  label,
  optionalLabel,
  placeholder = "you@example.com",
  id = "email",
  maxLength = 255,
  required,
}: BaseFieldProps) {
  return (
    <div className="space-y-1">
      <FieldLabel htmlFor={id} label={label} optionalLabel={optionalLabel} required={required} />
      <Input
        id={id}
        type="email"
        inputMode="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="email"
      />
    </div>
  );
}

export function ChurchNameField({
  value,
  onChange,
  label,
  optionalLabel,
  placeholder,
  id = "church",
  maxLength = 200,
  required,
}: BaseFieldProps) {
  return (
    <div className="space-y-1">
      <FieldLabel htmlFor={id} label={label} optionalLabel={optionalLabel} required={required} />
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        maxLength={maxLength}
        autoComplete="organization"
      />
    </div>
  );
}

interface PhoneFieldProps extends Omit<BaseFieldProps, "placeholder" | "maxLength"> {
  /** Initial country code; defaults to US. */
  defaultCountry?: string;
}

export function PhoneField({
  value,
  onChange,
  label,
  optionalLabel,
  id = "phone",
  required,
  defaultCountry = "US",
}: PhoneFieldProps) {
  // Country code is presentation-only (formatting); the caller just gets the
  // formatted national number string via onChange.
  const [countryCode, setCountryCode] = useState(defaultCountry);
  return (
    <div className="space-y-1">
      <FieldLabel htmlFor={id} label={label} optionalLabel={optionalLabel} required={required} />
      <PhoneInput
        id={id}
        value={value}
        countryCode={countryCode}
        onChange={onChange}
        onCountryChange={setCountryCode}
      />
    </div>
  );
}
