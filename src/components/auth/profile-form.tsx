"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChurchCombobox } from "@/components/shared/church-combobox";
import { BirthDatePicker } from "@/components/shared/birth-date-picker";
import { GRADE_LABELS } from "@/lib/utils/constants";
import { calculateAge } from "@/lib/utils/validators";
import {
  filterName,
  buildDisplayName,
  isPhoneIncomplete,
  buildPhoneValue,
  NAME_PATTERN,
} from "@/lib/utils/field-helpers";
import { PhoneInput } from "@/components/shared/phone-input";
import type { Gender, Grade } from "@/lib/types/database";

interface Church {
  id: string;
  name_en: string;
  is_other: boolean;
}

interface Department {
  id: string;
  name_en: string;
  name_ko: string;
}

export interface ProfileFormData {
  lastName: string;
  firstName: string;
  displayNameKo: string;
  gender: Gender | "";
  birthYear: number | undefined;
  birthMonth: number | undefined;
  birthDay: number | undefined;
  isK12: boolean;
  grade: Grade | "";
  phone: string;
  phoneCountry: string;
  email: string;
  departmentId: string;
  churchId: string;
  churchOther: string;
}

interface ProfileFormProps {
  initialData?: Partial<ProfileFormData>;
  churches: Church[];
  departments: Department[];
  showEmail?: boolean;
  hideDepartment?: boolean;
  hideBirthDate?: boolean;
  hideChurch?: boolean;
  eventStartDate?: string;
  onSubmit: (data: ProfileFormData) => Promise<void>;
  submitLabel?: string;
  loading?: boolean;
  children?: React.ReactNode;
}

export function ProfileForm({
  initialData,
  churches,
  departments,
  showEmail = false,
  hideDepartment = false,
  hideBirthDate = false,
  hideChurch = false,
  eventStartDate,
  onSubmit,
  submitLabel = "Save",
  loading = false,
  children,
}: ProfileFormProps) {
  const [form, setForm] = useState<ProfileFormData>({
    lastName: initialData?.lastName ?? "",
    firstName: initialData?.firstName ?? "",
    displayNameKo: initialData?.displayNameKo ?? "",
    gender: initialData?.gender ?? "",
    birthYear: initialData?.birthYear,
    birthMonth: initialData?.birthMonth,
    birthDay: initialData?.birthDay,
    isK12: initialData?.isK12 ?? false,
    grade: initialData?.grade ?? "",
    phone: initialData?.phone ?? "",
    phoneCountry: initialData?.phoneCountry ?? "US",
    email: initialData?.email ?? "",
    departmentId: initialData?.departmentId ?? "",
    churchId: initialData?.churchId ?? "",
    churchOther: initialData?.churchOther ?? "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-detect K-12 based on age
  const isMinor = (() => {
    if (!form.birthYear || !form.birthMonth || !form.birthDay) return false;
    const birthDate = new Date(form.birthYear, form.birthMonth - 1, form.birthDay);
    const refDate = eventStartDate ? new Date(eventStartDate) : new Date();
    return calculateAge(birthDate, refDate) < 18;
  })();

  const selectedChurch = churches.find((c) => c.id === form.churchId);
  const showChurchOther = selectedChurch?.is_other ?? false;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.lastName.trim()) {
      errs.lastName = "Required";
    } else if (!NAME_PATTERN.test(form.lastName.trim())) {
      errs.lastName = "Uppercase letters only";
    }
    if (!form.firstName.trim()) {
      errs.firstName = "Required";
    } else if (!NAME_PATTERN.test(form.firstName.trim())) {
      errs.firstName = "Uppercase letters only";
    }
    if (!form.displayNameKo.trim()) errs.displayNameKo = "Required";
    if (!form.gender) errs.gender = "Required";
    if (!hideBirthDate) {
      if (!form.birthYear || !form.birthMonth || !form.birthDay) {
        errs.birthDate = "Required";
      } else {
        const currentYear = new Date().getFullYear();
        if (
          form.birthYear < currentYear - 120 ||
          form.birthYear > currentYear ||
          String(form.birthYear).length !== 4
        ) {
          errs.birthDate = `Year must be between ${currentYear - 120} and ${currentYear}`;
        }
      }
      if ((form.isK12 || isMinor) && !form.grade) errs.grade = "Required";
    }
    if (!form.phone.trim()) errs.phone = "Required";
    if (showEmail && !form.email.trim()) errs.email = "Required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const trimFields = (data: ProfileFormData): ProfileFormData => ({
    ...data,
    lastName: data.lastName.trim().replace(/\s{2,}/g, " "),
    firstName: data.firstName.trim().replace(/\s{2,}/g, " "),
    displayNameKo: data.displayNameKo.trim(),
    phone: buildPhoneValue(data.phoneCountry, data.phone),
    email: data.email.trim(),
    churchOther: data.churchOther.trim(),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(
      trimFields({
        ...form,
        isK12: form.isK12 || isMinor,
      })
    );
  };

  const update = (field: keyof ProfileFormData, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleNameChange = (field: "lastName" | "firstName", raw: string) => {
    const v = filterName(raw);
    update(field, v);
    const first = field === "firstName" ? v : form.firstName;
    const last = field === "lastName" ? v : form.lastName;
    setForm((prev) => ({ ...prev, [field]: v, displayNameKo: buildDisplayName(first, last) }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Names */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="firstName">First Name (Legal) *</Label>
          <Input
            id="firstName"
            value={form.firstName}
            onChange={(e) => handleNameChange("firstName", e.target.value)}
            placeholder="JOHN"
          />
          {errors.firstName && (
            <p className="text-xs text-destructive">{errors.firstName}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="lastName">Last Name (Legal) *</Label>
          <Input
            id="lastName"
            value={form.lastName}
            onChange={(e) => handleNameChange("lastName", e.target.value)}
            placeholder="KIM"
          />
          {errors.lastName && (
            <p className="text-xs text-destructive">{errors.lastName}</p>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="displayNameKo">Display Name *</Label>
        <Input
          id="displayNameKo"
          value={form.displayNameKo}
          onChange={(e) => update("displayNameKo", e.target.value)}
          placeholder="Scott Kim"
        />
        {errors.displayNameKo && (
          <p className="text-xs text-destructive">{errors.displayNameKo}</p>
        )}
      </div>

      {/* Gender */}
      <div className="space-y-1">
        <Label>Gender *</Label>
        <Select
          value={form.gender}
          onValueChange={(v) => update("gender", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MALE">Male</SelectItem>
            <SelectItem value="FEMALE">Female</SelectItem>
            <SelectItem value="NON_BINARY">Non-binary</SelectItem>
            <SelectItem value="PREFER_NOT_TO_SAY">Prefer not to say</SelectItem>
          </SelectContent>
        </Select>
        {errors.gender && (
          <p className="text-xs text-destructive">{errors.gender}</p>
        )}
        <p className="text-muted-foreground" style={{ fontSize: "0.625rem" }}>
          We collect gender information for statistical and program accommodation purposes only. It will not be used for discriminatory decisions.
        </p>
      </div>

      {/* Birth Date + K-12 + Grade (hidden on signup) */}
      {!hideBirthDate && (
        <>
          <div>
            <BirthDatePicker
              year={form.birthYear}
              month={form.birthMonth}
              day={form.birthDay}
              onYearChange={(v) => update("birthYear", v)}
              onMonthChange={(v) => update("birthMonth", v)}
              onDayChange={(v) => update("birthDay", v)}
            />
            {errors.birthDate && (
              <p className="text-xs text-destructive">{errors.birthDate}</p>
            )}
          </div>

          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="isK12"
              checked={form.isK12 || isMinor}
              onChange={(e) => update("isK12", e.target.checked)}
              disabled={isMinor}
              className="mt-1"
            />
            <Label htmlFor="isK12" className="text-sm font-normal leading-snug">
              I am currently a Pre-K/K-12 student (high school or younger)
            </Label>
          </div>

          {(form.isK12 || isMinor) && (
            <div className="space-y-1">
              <Label>Grade *</Label>
              <Select
                value={form.grade}
                onValueChange={(v) => update("grade", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(GRADE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.grade && (
                <p className="text-xs text-destructive">{errors.grade}</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Department */}
      {!hideDepartment && (
        <div className="space-y-1">
          <Label>Department</Label>
          <Select
            value={form.departmentId}
            onValueChange={(v) => update("departmentId", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name_en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Email (conditional) */}
      {showEmail && (
        <div className="space-y-1">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="email@example.com"
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email}</p>
          )}
        </div>
      )}

      {/* Phone */}
      <div className="space-y-1">
        <Label htmlFor="phone">Phone Number *</Label>
        <PhoneInput
          id="phone"
          value={form.phone}
          countryCode={form.phoneCountry}
          onChange={(v) => update("phone", v)}
          onCountryChange={(c) => update("phoneCountry", c)}
          error={!!errors.phone || isPhoneIncomplete(form.phone, form.phoneCountry)}
        />
        {isPhoneIncomplete(form.phone, form.phoneCountry) && (
          <p className="text-xs text-destructive">Enter a complete phone number</p>
        )}
        {errors.phone && (
          <p className="text-xs text-destructive">{errors.phone}</p>
        )}
        <p className="text-muted-foreground" style={{ fontSize: "0.625rem" }}>
          By providing your number, you agree to receive service-related messages.
        </p>
      </div>

      {/* Church */}
      {!hideChurch && (
        <>
          <div className="space-y-1">
            <Label>Church</Label>
            <ChurchCombobox
              churches={churches}
              value={form.churchId}
              onValueChange={(v) => update("churchId", v)}
            />
          </div>

          {/* Church Other (conditional) */}
          {showChurchOther && (
            <div className="space-y-1">
              <Label htmlFor="churchOther">Church Name</Label>
              <Input
                id="churchOther"
                value={form.churchOther}
                onChange={(e) => update("churchOther", e.target.value)}
                placeholder="Enter your church name"
              />
            </div>
          )}
        </>
      )}

      {children}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
