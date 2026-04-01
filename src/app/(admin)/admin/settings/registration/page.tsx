"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

export default function RegistrationSettingsPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [savedIsOpen, setSavedIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSaveWarning, setShowSaveWarning] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/app-config");
        if (res.ok) {
          const data = await res.json();
          const open = data.config?.registration_open ?? false;
          setIsOpen(open);
          setSavedIsOpen(open);
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
      setSavedIsOpen(isOpen);
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
            <Button
              onClick={() => setShowSaveWarning(true)}
              disabled={saving || isOpen === savedIsOpen}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        <AlertDialog open={showSaveWarning} onOpenChange={setShowSaveWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                {isOpen ? "Open Registration?" : "Close Registration?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isOpen
                  ? "New registrations will be accepted for the current event. Make sure all fee categories and groups are configured correctly."
                  : "Registration will be closed. No new registrations will be accepted for the current event."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleSave();
                  setShowSaveWarning(false);
                }}
              >
                {isOpen ? "Open Registration" : "Close Registration"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
