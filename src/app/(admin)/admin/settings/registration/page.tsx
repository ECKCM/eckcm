"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export default function RegistrationSettingsPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/app-config");
        if (res.ok) {
          const data = await res.json();
          setIsOpen(data.config?.registration_open ?? false);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/admin/app-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "registration_open", value: isOpen }),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-6" />
          <h1 className="text-lg font-semibold">Registration Settings</h1>
        </header>
        <div className="flex items-center justify-center p-12">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Registration Settings</h1>
      </header>
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Registration Toggle</CardTitle>
            <CardDescription>
              Control whether new registrations are accepted for the current event.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="reg-toggle" className="flex flex-col gap-1">
                <span>Registration Open</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {isOpen ? "New registrations are being accepted" : "Registration is currently closed"}
                </span>
              </Label>
              <Switch
                id="reg-toggle"
                checked={isOpen}
                onCheckedChange={setIsOpen}
              />
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
