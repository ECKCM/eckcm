"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/context";
import { buildPhoneValue, stripDialCode } from "@/lib/utils/field-helpers";
import {
  ProfileForm,
  type ProfileFormData,
} from "@/components/auth/profile-form";

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

interface ProfileSettingsProps {
  userId: string;
  profile: {
    email: string;
    auth_provider: string;
    locale: string;
  } | null;
  person: {
    id: string;
    first_name_en: string;
    last_name_en: string;
    display_name_ko: string | null;
    gender: string;
    birth_date: string | null;
    is_k12: boolean;
    grade: string | null;
    email: string | null;
    phone: string | null;
    phone_country: string | null;
    department_id: string | null;
    church_id: string | null;
    church_other: string | null;
  } | null;
  churches: Church[];
  departments: Department[];
  eventStartDate?: string;
}

export function ProfileSettings({
  userId,
  profile,
  person,
  churches,
  departments,
  eventStartDate,
}: ProfileSettingsProps) {
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<ProfileFormData | null>(null);
  const { locale: i18nLocale, setLocale: setI18nLocale } = useI18n();
  const [locale, setLocale] = useState(profile?.locale ?? "en");
  const { theme, setTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  // Keep form locale in sync with i18n context (e.g., toolbar toggle)
  useEffect(() => {
    setLocale(i18nLocale);
  }, [i18nLocale]);

  // Parse birth date for ProfileForm initial data
  const parsedBirth = person?.birth_date
    ? (() => {
        const [y, m, d] = person.birth_date.split("-").map(Number);
        return { birthYear: y, birthMonth: m, birthDay: d };
      })()
    : {};

  // Strip dial code prefix from stored phone
  const initCountry = person?.phone_country ?? "US";
  const nationalPhone = stripDialCode(person?.phone ?? "", initCountry);

  const initialData: Partial<ProfileFormData> = {
    firstName: person?.first_name_en ?? "",
    lastName: person?.last_name_en ?? "",
    displayNameKo: person?.display_name_ko ?? "",
    gender: (person?.gender as ProfileFormData["gender"]) ?? "",
    ...parsedBirth,
    isK12: person?.is_k12 ?? false,
    grade: (person?.grade as ProfileFormData["grade"]) ?? "",
    phone: nationalPhone,
    phoneCountry: initCountry,
    departmentId: person?.department_id ?? "",
    churchId: person?.church_id ?? "",
    churchOther: person?.church_other ?? "",
  };

  // Show confirmation dialog instead of saving immediately
  const handleSubmit = async (data: ProfileFormData) => {
    setPendingData(data);
    setShowConfirm(true);
  };

  const confirmSave = async () => {
    if (!pendingData) return;
    setShowConfirm(false);
    setSaving(true);
    const supabase = createClient();

    // Update user locale
    const { error: userError } = await supabase
      .from("eckcm_users")
      .update({ locale })
      .eq("id", userId);

    if (userError) {
      toast.error("Failed to update preferences");
      setSaving(false);
      return;
    }

    // Update person info
    if (person) {
      const storedPhone = pendingData.phone
        ? buildPhoneValue(pendingData.phoneCountry, pendingData.phone)
        : null;

      const birthDate =
        pendingData.birthYear && pendingData.birthMonth && pendingData.birthDay
          ? `${pendingData.birthYear}-${String(pendingData.birthMonth).padStart(2, "0")}-${String(pendingData.birthDay).padStart(2, "0")}`
          : null;

      const { error: personError } = await supabase
        .from("eckcm_people")
        .update({
          first_name_en: pendingData.firstName,
          last_name_en: pendingData.lastName,
          display_name_ko: pendingData.displayNameKo || null,
          gender: pendingData.gender || null,
          birth_date: birthDate,
          is_k12: pendingData.isK12,
          grade: pendingData.grade || null,
          phone: storedPhone,
          phone_country: pendingData.phoneCountry,
          department_id: pendingData.departmentId || null,
          church_id: pendingData.churchId || null,
          church_other: pendingData.churchOther || null,
        })
        .eq("id", person.id);

      if (personError) {
        toast.error("Failed to update profile");
        setSaving(false);
        return;
      }
    }

    // Sync locale to i18n context so toolbar updates immediately
    setI18nLocale(locale as "en" | "ko");

    toast.success("Settings saved");
    setSaving(false);
    setPendingData(null);
  };

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* Account Info (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-muted-foreground text-xs">Email</Label>
            <p className="text-sm">{profile?.email}</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Providers</Label>
            <p className="text-sm capitalize">{profile?.auth_provider}</p>
          </div>
        </CardContent>
      </Card>

      {/* Personal Info — reuses the same ProfileForm as signup */}
      {person && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal Info</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm
              initialData={initialData}
              churches={churches}
              departments={departments}
              eventStartDate={eventStartDate}
              hideDepartment
              hideBirthDate
              hideChurch
              onSubmit={handleSubmit}
              submitLabel={saving ? "Saving..." : "Save Changes"}
              loading={saving}
            >
              <Separator />

              {/* Preferences */}
              <div className="space-y-4">
                <h3 className="text-base font-semibold">Preferences</h3>

                <div className="space-y-1">
                  <Label htmlFor="locale">Language</Label>
                  {mounted ? (
                    <Select value={locale} onValueChange={setLocale}>
                      <SelectTrigger id="locale">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="ko">한국어</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 text-sm">
                      {locale === "ko" ? "한국어" : "English"}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="theme">Theme</Label>
                  {mounted ? (
                    <Select
                      value={theme ?? "light"}
                      onValueChange={setTheme}
                    >
                      <SelectTrigger id="theme">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 text-sm">
                      Light
                    </div>
                  )}
                </div>
              </div>
            </ProfileForm>
          </CardContent>
        </Card>
      )}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to update your profile settings?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Discard</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSave}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
