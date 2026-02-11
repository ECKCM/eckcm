"use client";

import { useState } from "react";
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
  } | null;
}

export function ProfileSettings({
  userId,
  profile,
  person,
}: ProfileSettingsProps) {
  const [saving, setSaving] = useState(false);
  const [locale, setLocale] = useState(profile?.locale ?? "en");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [displayNameKo, setDisplayNameKo] = useState(
    person?.display_name_ko ?? ""
  );

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();

    // Update user locale
    const { error: userError } = await supabase
      .from("ECKCM_users")
      .update({ locale })
      .eq("id", userId);

    if (userError) {
      toast.error("Failed to update preferences");
      setSaving(false);
      return;
    }

    // Update person info
    if (person) {
      const { error: personError } = await supabase
        .from("ECKCM_people")
        .update({
          phone: phone || null,
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
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="123-456-7890"
              />
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
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger id="locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ko">한국어</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
