"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BirthDatePicker } from "@/components/shared/birth-date-picker";
import { GRADE_LABELS } from "@/lib/utils/constants";
import { calculateAge } from "@/lib/utils/validators";
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
  eventStartDate?: string;
  onSubmit: (data: ProfileFormData) => Promise<void>;
  submitLabel?: string;
  loading?: boolean;
}

export function ProfileForm({
  initialData,
  churches,
  departments,
  showEmail = false,
  eventStartDate,
  onSubmit,
  submitLabel = "Save",
  loading = false,
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

  // Regex: English and Spanish letters only (a-z, accented chars like ñ, é, etc.)
  const namePattern = /^[A-Za-zÀ-ÖØ-öø-ÿÑñ]+(?: [A-Za-zÀ-ÖØ-öø-ÿÑñ]+)*$/;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.lastName.trim()) {
      errs.lastName = "Required";
    } else if (!namePattern.test(form.lastName.trim())) {
      errs.lastName = "English/Spanish letters only, no leading/trailing spaces";
    }
    if (!form.firstName.trim()) {
      errs.firstName = "Required";
    } else if (!namePattern.test(form.firstName.trim())) {
      errs.firstName = "English/Spanish letters only, no leading/trailing spaces";
    }
    if (!form.gender) errs.gender = "Required";
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
    if (!form.phone.trim()) errs.phone = "Required";
    if (showEmail && !form.email.trim()) errs.email = "Required";
    if ((form.isK12 || isMinor) && !form.grade) errs.grade = "Required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const trimFields = (data: ProfileFormData): ProfileFormData => ({
    ...data,
    lastName: data.lastName.trim().replace(/\s{2,}/g, " "),
    firstName: data.firstName.trim().replace(/\s{2,}/g, " "),
    displayNameKo: data.displayNameKo.trim(),
    phone: data.phone.trim(),
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

  // Filter name input: allow only English/Spanish letters and single spaces (no leading space)
  const handleNameChange = (field: "lastName" | "firstName", raw: string) => {
    // Remove characters that aren't letters or spaces
    let v = raw.replace(/[^A-Za-zÀ-ÖØ-öø-ÿÑñ ]/g, "");
    // No leading spaces
    v = v.replace(/^\s+/, "");
    // Collapse consecutive spaces to one
    v = v.replace(/\s{2,}/g, " ");
    update(field, v);

    // Auto-populate Display Name from First + Last Name
    const first = field === "firstName" ? v : form.firstName;
    const last = field === "lastName" ? v : form.lastName;
    const displayName = `${first.trim()} ${last.trim()}`.trim();
    setForm((prev) => ({ ...prev, [field]: v, displayNameKo: displayName }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Names */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="firstName">First Name (EN) *</Label>
          <Input
            id="firstName"
            value={form.firstName}
            onChange={(e) => handleNameChange("firstName", e.target.value)}
            placeholder="John"
          />
          {errors.firstName && (
            <p className="text-xs text-destructive">{errors.firstName}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="lastName">Last Name (EN) *</Label>
          <Input
            id="lastName"
            value={form.lastName}
            onChange={(e) => handleNameChange("lastName", e.target.value)}
            placeholder="Kim"
          />
          {errors.lastName && (
            <p className="text-xs text-destructive">{errors.lastName}</p>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="displayNameKo">Display Name</Label>
        <Input
          id="displayNameKo"
          value={form.displayNameKo}
          onChange={(e) => update("displayNameKo", e.target.value)}
          placeholder="Scott Kim"
        />
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
            <SelectItem value="OTHERS">Others</SelectItem>
          </SelectContent>
        </Select>
        {errors.gender && (
          <p className="text-xs text-destructive">{errors.gender}</p>
        )}
      </div>

      {/* Birth Date */}
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

      {/* K-12 checkbox */}
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
          I am currently a K-12 student (high school or younger)
        </Label>
      </div>

      {/* Grade (conditional) */}
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

      {/* Department */}
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
        <Input
          id="phone"
          type="tel"
          value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
          placeholder="(000) 000-0000"
        />
        {errors.phone && (
          <p className="text-xs text-destructive">{errors.phone}</p>
        )}
      </div>

      {/* Church */}
      <div className="space-y-1">
        <Label>Church</Label>
        <Select
          value={form.churchId}
          onValueChange={(v) => update("churchId", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select church" />
          </SelectTrigger>
          <SelectContent>
            {churches
              .sort((a, b) => {
                if (a.is_other) return -1;
                if (b.is_other) return 1;
                return a.name_en.localeCompare(b.name_en);
              })
              .map((church) => (
                <SelectItem key={church.id} value={church.id}>
                  {church.name_en}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
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

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
