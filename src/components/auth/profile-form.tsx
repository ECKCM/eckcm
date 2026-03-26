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
  sanitizeEmailInput,
} from "@/lib/utils/field-helpers";
import { PhoneInput } from "@/components/shared/phone-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info, CircleHelp } from "lucide-react";
import type { Gender, Grade, ChurchRole } from "@/lib/types/database";
import { useI18n } from "@/lib/i18n/context";

interface Church {
  id: string;
  name_en: string;
  name_ko: string | null;
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
  churchRole: ChurchRole | "";
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
  onValidate?: () => boolean;
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
  onValidate,
  submitLabel = "Save",
  loading = false,
  children,
}: ProfileFormProps) {
  const { t, locale } = useI18n();
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
    churchRole: initialData?.churchRole ?? "",
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
  const isNoHomeChurch = (selectedChurch?.name_en ?? "").replace(/\W/g, "").toLowerCase() === "nohomechurch";

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.lastName.trim()) {
      errs.lastName = t("common.required");
    } else if (!NAME_PATTERN.test(form.lastName.trim())) {
      errs.lastName = t("profile.uppercaseOnly");
    }
    if (!form.firstName.trim()) {
      errs.firstName = t("common.required");
    } else if (!NAME_PATTERN.test(form.firstName.trim())) {
      errs.firstName = t("profile.uppercaseOnly");
    }
    if (!form.displayNameKo.trim()) errs.displayNameKo = t("common.required");
    if (!form.gender) errs.gender = t("common.required");
    if (!hideBirthDate) {
      if (!form.birthYear || !form.birthMonth || !form.birthDay) {
        errs.birthDate = t("common.required");
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
      if ((form.isK12 || isMinor) && !form.grade) errs.grade = t("common.required");
    }
    if (!form.phone.trim()) errs.phone = t("common.required");
    if (showEmail && !form.email.trim()) errs.email = t("common.required");
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
    const profileValid = validate();
    const externalValid = onValidate ? onValidate() : true;
    if (!profileValid || !externalValid) return;
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
          <Label htmlFor="firstName">{t("profile.firstNameLegal")} <span className="text-destructive">*</span></Label>
          <Input
            id="firstName"
            value={form.firstName}
            onChange={(e) => handleNameChange("firstName", e.target.value)}
            placeholder={t("profile.firstNamePlaceholder")}
            className={errors.firstName ? "border-destructive" : ""}
          />
          {errors.firstName && (
            <p className="text-xs text-destructive">{errors.firstName}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="lastName">{t("profile.lastNameLegal")} <span className="text-destructive">*</span></Label>
          <Input
            id="lastName"
            value={form.lastName}
            onChange={(e) => handleNameChange("lastName", e.target.value)}
            placeholder={t("profile.lastNamePlaceholder")}
            className={errors.lastName ? "border-destructive" : ""}
          />
          {errors.lastName && (
            <p className="text-xs text-destructive">{errors.lastName}</p>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Label htmlFor="displayNameKo">{t("profile.displayName")} <span className="text-destructive">*</span></Label>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground">
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="text-xs">
              <>{t("profile.displayNameHint")}<br />{t("profile.displayNameHintKo")}</>
            </PopoverContent>
          </Popover>
        </div>
        <Input
          id="displayNameKo"
          value={form.displayNameKo}
          onChange={(e) => update("displayNameKo", e.target.value)}
          placeholder={t("profile.displayNamePlaceholder")}
          className={errors.displayNameKo ? "border-destructive" : ""}
        />
        <p className="text-[0.625rem] text-muted-foreground">{t("profile.displayNameSubHint")}</p>
        {errors.displayNameKo && (
          <p className="text-xs text-destructive">{errors.displayNameKo}</p>
        )}
      </div>

      {/* Gender */}
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Label>{t("profile.gender")} <span className="text-destructive">*</span></Label>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground">
                <Info className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="text-xs">
              {t("profile.genderInfo")}
            </PopoverContent>
          </Popover>
        </div>
        <Select
          value={form.gender}
          onValueChange={(v) => update("gender", v)}
        >
          <SelectTrigger className={errors.gender ? "border-destructive" : ""}>
            <SelectValue placeholder={t("profile.selectGender")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MALE">{t("profile.male")}</SelectItem>
            <SelectItem value="FEMALE">{t("profile.female")}</SelectItem>
            <SelectItem value="NON_BINARY">{t("profile.nonBinary")}</SelectItem>
            <SelectItem value="PREFER_NOT_TO_SAY">{t("profile.preferNotToSay")}</SelectItem>
          </SelectContent>
        </Select>
        {errors.gender && (
          <p className="text-xs text-destructive">{errors.gender}</p>
        )}
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
              {t("profile.isK12")}
            </Label>
          </div>

          {(form.isK12 || isMinor) && (
            <div className="space-y-1">
              <Label>{t("profile.grade")} <span className="text-destructive">*</span></Label>
              <Select
                value={form.grade}
                onValueChange={(v) => update("grade", v)}
              >
                <SelectTrigger className={errors.grade ? "border-destructive" : ""}>
                  <SelectValue placeholder={t("profile.selectGrade")} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(GRADE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {locale === "ko" ? label.ko : label.en}
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
          <Label>{t("registration.department")}</Label>
          <Select
            value={form.departmentId}
            onValueChange={(v) => update("departmentId", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("profile.selectDepartment")} />
            </SelectTrigger>
            <SelectContent>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {locale === "ko" ? dept.name_ko : dept.name_en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Email (conditional) */}
      {showEmail && (
        <div className="space-y-1">
          <Label htmlFor="email">{t("auth.email")} <span className="text-destructive">*</span></Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", sanitizeEmailInput(e.target.value))}
            placeholder="email@example.com"
            className={errors.email ? "border-destructive" : ""}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email}</p>
          )}
        </div>
      )}

      {/* Phone */}
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Label htmlFor="phone">{t("profile.phoneNumber")} <span className="text-destructive">*</span></Label>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground">
                <Info className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="text-xs">
              {t("profile.phoneInfo")}
            </PopoverContent>
          </Popover>
        </div>
        <PhoneInput
          id="phone"
          value={form.phone}
          countryCode={form.phoneCountry}
          onChange={(v) => update("phone", v)}
          onCountryChange={(c) => update("phoneCountry", c)}
          error={!!errors.phone || isPhoneIncomplete(form.phone, form.phoneCountry)}
        />
        {isPhoneIncomplete(form.phone, form.phoneCountry) && (
          <p className="text-xs text-destructive">{t("profile.incompletePhone")}</p>
        )}
        {errors.phone && (
          <p className="text-xs text-destructive">{errors.phone}</p>
        )}
      </div>

      {/* Church */}
      {!hideChurch && (
        <>
          <div className="space-y-1">
            <Label>{t("profile.church")}</Label>
            <ChurchCombobox
              churches={churches}
              value={form.churchId}
              onValueChange={(v) => update("churchId", v)}
            />
          </div>

          {/* Church Other (conditional) */}
          {showChurchOther && (
            <div className="space-y-1">
              <Label htmlFor="churchOther">{t("profile.churchName")}</Label>
              <Input
                id="churchOther"
                value={form.churchOther}
                onChange={(e) => update("churchOther", e.target.value)}
                placeholder={t("profile.enterChurchName")}
              />
            </div>
          )}

          {/* Church Role (hidden when No Home Church) */}
          {!isNoHomeChurch && (
            <div className="space-y-1">
              <Label>{t("profile.churchRole")} <span className="text-muted-foreground text-xs font-normal">({t("profile.optional")})</span></Label>
              <Select
                value={form.churchRole}
                onValueChange={(v) => update("churchRole", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("profile.selectChurchRole")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">{t("profile.member")}</SelectItem>
                  <SelectItem value="DEACON">{t("profile.deacon")}</SelectItem>
                  <SelectItem value="ELDER">{t("profile.elder")}</SelectItem>
                  <SelectItem value="MINISTER">{t("profile.minister")}</SelectItem>
                  <SelectItem value="PASTOR">{t("profile.pastor")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}

      {children}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t("common.saving") : submitLabel}
      </Button>
    </form>
  );
}
