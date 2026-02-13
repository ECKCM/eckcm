"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { isPhoneIncomplete, buildPhoneValue } from "@/lib/utils/field-helpers";
import { PhoneInput } from "@/components/shared/phone-input";

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
    birth_date: string;
    email: string | null;
    phone: string | null;
    phone_country: string | null;
  } | null;
}

export function ProfileSettings({
  userId,
  profile,
  person,
}: ProfileSettingsProps) {
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locale, setLocale] = useState(profile?.locale ?? "en");

  useEffect(() => setMounted(true), []);
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [phoneCountry, setPhoneCountry] = useState(person?.phone_country ?? "US");
  const [displayNameKo, setDisplayNameKo] = useState(
    person?.display_name_ko ?? ""
  );

  const handleSave = async () => {
    if (isPhoneIncomplete(phone, phoneCountry)) {
      toast.error("Enter a complete phone number");
      return;
    }
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
      const storedPhone = phone ? buildPhoneValue(phoneCountry, phone) : null;
      const { error: personError } = await supabase
        .from("eckcm_people")
        .update({
          phone: storedPhone,
          phone_country: phoneCountry,
          display_name_ko: displayNameKo || null,
        })
        .eq("id", person.id);

      if (personError) {
        toast.error("Failed to update profile");
        setSaving(false);
        return;
      }
    }

    toast.success("Settings saved");
    setSaving(false);
  };

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
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
            <Label className="text-muted-foreground text-xs">
              Auth Provider
            </Label>
            <p className="text-sm capitalize">{profile?.auth_provider}</p>
          </div>
        </CardContent>
      </Card>

      {/* Personal Info */}
      {person && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">
                  First Name
                </Label>
                <p className="text-sm">{person.first_name_en}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">
                  Last Name
                </Label>
                <p className="text-sm">{person.last_name_en}</p>
              </div>
            </div>

            <div>
              <Label htmlFor="displayNameKo">Display Name (Korean)</Label>
              <Input
                id="displayNameKo"
                value={displayNameKo}
                onChange={(e) => setDisplayNameKo(e.target.value)}
                placeholder="한국어 이름"
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone</Label>
              <PhoneInput
                id="phone"
                value={phone}
                countryCode={phoneCountry}
                onChange={setPhone}
                onCountryChange={setPhoneCountry}
                error={isPhoneIncomplete(phone, phoneCountry)}
              />
              {isPhoneIncomplete(phone, phoneCountry) && (
                <p className="text-xs text-destructive mt-1">Enter a complete phone number</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Gender</Label>
                <p className="text-sm">{person.gender}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">
                  Birth Date
                </Label>
                <p className="text-sm">{person.birth_date}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
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
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
