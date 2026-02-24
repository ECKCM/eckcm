"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Check, Loader2, Palette, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useColorTheme } from "@/components/shared/color-theme-provider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  COLOR_THEMES,
  COLOR_THEME_IDS,
  type ColorThemeId,
} from "@/lib/color-theme";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

export function ConfigurationManager() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [loading, setLoading] = useState(true);

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const expectedText = "ECKCMRESET";
  const canConfirm = confirmText === expectedText;

  useEffect(() => {
    async function fetchEvents() {
      const supabase = createClient();
      const { data } = await supabase
        .from("eckcm_events")
        .select("id, name_en, year")
        .order("year", { ascending: false });
      if (data) setEvents(data);
      setLoading(false);
    }
    fetchEvents();
  }, []);

  async function handleHardReset() {
    if (!selectedEventId || !canConfirm) return;
    setResetting(true);

    try {
      const res = await fetch("/api/admin/hard-reset-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: selectedEventId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Reset failed (${res.status})`);
        return;
      }

      const data = await res.json();
      toast.success(
        `Event reset complete. Deleted ${data.deletedRegistrations} registrations, ${data.deletedInvoices} invoices, ${data.deletedPayments} payments.`
      );
      setDialogOpen(false);
      setConfirmText("");
      setSelectedEventId("");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Color Theme */}
      <ThemeSection />

      {/* Security */}
      <SecuritySection />

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Hard Reset Event */}
          <div className="rounded-lg border border-destructive/30 p-4 space-y-4">
            <div>
              <h3 className="font-semibold">Hard Reset Event</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Permanently delete all registrations, invoices, payments,
                participants, groups, check-ins, and sessions for an event.
                Event configuration (fees, registration groups, meal rules) will
                be preserved.
              </p>
            </div>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1.5">
                  Select Event
                </label>
                <Select
                  value={selectedEventId}
                  onValueChange={setSelectedEventId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an event..." />
                  </SelectTrigger>
                  <SelectContent>
                    {events.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.name_en} ({event.year})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="destructive"
                disabled={!selectedEventId}
                onClick={() => setDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Hard Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hard Reset Confirmation Dialog */}
      <AlertDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmText("");
          }
          setDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Hard Reset Event
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will permanently delete <strong>all data</strong> for{" "}
                  <strong>{expectedText}</strong>:
                </p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>All registrations and confirmation codes</li>
                  <li>All invoices and payment records</li>
                  <li>All room groups and participant assignments</li>
                  <li>All check-ins and sessions</li>
                  <li>All e-pass tokens</li>
                  <li>Orphaned people records (not linked to user accounts)</li>
                </ul>
                <p className="font-medium text-destructive">
                  This action cannot be undone.
                </p>
                <div className="pt-2">
                  <label className="block text-sm font-medium mb-1.5">
                    Type <strong>ECKCMRESET</strong> to confirm:
                  </label>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="ECKCMRESET"
                    autoComplete="off"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleHardReset();
              }}
              disabled={!canConfirm || resetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Resetting...
                </>
              ) : (
                "Hard Reset"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Security Section ── */

function SecuritySection() {
  const [turnstileEnabled, setTurnstileEnabled] = useState<boolean>(true);
  const [allowDuplicateEmail, setAllowDuplicateEmail] = useState<boolean>(false);
  const [allowDuplicateRegistration, setAllowDuplicateRegistration] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/admin/app-config")
      .then((res) => res.json())
      .then((data) => {
        setTurnstileEnabled(data.turnstile_enabled ?? true);
        setAllowDuplicateEmail(data.allow_duplicate_email ?? false);
        setAllowDuplicateRegistration(data.allow_duplicate_registration ?? false);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function handleToggle(field: string, checked: boolean) {
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/app-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: checked }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Failed to update (${res.status})`);
        return;
      }

      if (field === "turnstile_enabled") {
        setTurnstileEnabled(checked);
        toast.success(checked ? "Cloudflare Turnstile enabled." : "Cloudflare Turnstile disabled.");
      } else if (field === "allow_duplicate_email") {
        setAllowDuplicateEmail(checked);
        toast.success(checked ? "Duplicate emails allowed." : "Duplicate email check restored.");
      } else if (field === "allow_duplicate_registration") {
        setAllowDuplicateRegistration(checked);
        toast.success(checked ? "Duplicate registrations allowed." : "Duplicate registration check restored.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Security
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base font-medium">
              Cloudflare Turnstile
            </Label>
            <p className="text-sm text-muted-foreground">
              Show the Turnstile CAPTCHA widget on login, signup, and
              forgot-password pages.
            </p>
          </div>
          <Switch
            checked={turnstileEnabled}
            onCheckedChange={(checked) => handleToggle("turnstile_enabled", checked)}
            disabled={isSaving}
          />
        </div>
        {!turnstileEnabled && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-800 dark:text-amber-300">
            <strong>Action required:</strong> Also disable &ldquo;Enable Captcha
            protection&rdquo; in{" "}
            <a
              href="https://supabase.com/dashboard/project/ldepcbxuktigbsgnufcb/auth/providers"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:opacity-80"
            >
              Supabase Authentication Settings
            </a>{" "}
            → Security and Protection. Otherwise auth will still fail without a
            captcha token.
          </div>
        )}

        {/* Allow Duplicate Email */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base font-medium">
              Allow Duplicate Email
            </Label>
            <p className="text-sm text-muted-foreground">
              Skip the duplicate email check during registration. Useful for
              testing with the same email across multiple participants.
            </p>
          </div>
          <Switch
            checked={allowDuplicateEmail}
            onCheckedChange={(checked) => handleToggle("allow_duplicate_email", checked)}
            disabled={isSaving}
          />
        </div>
        {allowDuplicateEmail && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-800 dark:text-amber-300">
            <strong>Testing mode:</strong> Duplicate email validation is
            disabled. Multiple participants can register with the same email
            address. Disable this before going live.
          </div>
        )}

        {/* Allow Duplicate Registration */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base font-medium">
              Allow Duplicate Registration
            </Label>
            <p className="text-sm text-muted-foreground">
              Allow the same account to register multiple times for the same
              event. Useful for testing the full payment flow repeatedly.
            </p>
          </div>
          <Switch
            checked={allowDuplicateRegistration}
            onCheckedChange={(checked) => handleToggle("allow_duplicate_registration", checked)}
            disabled={isSaving}
          />
        </div>
        {allowDuplicateRegistration && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-800 dark:text-amber-300">
            <strong>Testing mode:</strong> The same user can create multiple
            registrations for the same event. Disable this before going live.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Theme Section ── */

const THEME_PALETTES: Record<
  ColorThemeId,
  { swatches: string[]; darkSwatches: string[] }
> = {
  eckcm: {
    swatches: ["#4a9e3f", "#81c784", "#c8e6c9", "#2e7d32", "#ffffff"],
    darkSwatches: ["#66bb6a", "#388e3c", "#1b5e20", "#a5d6a7", "#0a0a0a"],
  },
  upj: {
    swatches: ["#003594", "#ffb81c", "#dbeeff", "#00205b", "#ffffff"],
    darkSwatches: ["#5b93ff", "#ffb81c", "#162a48", "#66b2e3", "#080e1e"],
  },
};

function ThemeSection() {
  const { colorTheme, setColorTheme } = useColorTheme();
  const [savedTheme, setSavedTheme] = useState<ColorThemeId>(colorTheme);
  const [pendingTheme, setPendingTheme] = useState<ColorThemeId>(colorTheme);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch the currently saved theme from DB on mount
  useEffect(() => {
    fetch("/api/admin/app-config")
      .then((res) => res.json())
      .then((data) => {
        if (data.color_theme) {
          setSavedTheme(data.color_theme);
          setPendingTheme(data.color_theme);
        }
      })
      .catch(() => {});
  }, []);

  const hasChanges = pendingTheme !== savedTheme;

  async function handleApply() {
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/app-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color_theme: pendingTheme }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Failed to save theme (${res.status})`);
        return;
      }

      setSavedTheme(pendingTheme);
      setColorTheme(pendingTheme);
      toast.success(
        `Theme changed to ${COLOR_THEMES[pendingTheme].name}. Applied globally.`
      );
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Color Theme
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Select the color theme for the entire application. Changes are saved
          globally and apply to all users.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {COLOR_THEME_IDS.map((id) => {
            const theme = COLOR_THEMES[id];
            const palette = THEME_PALETTES[id];
            const isSelected = pendingTheme === id;
            const isCurrent = savedTheme === id;

            return (
              <button
                key={id}
                onClick={() => setPendingTheme(id)}
                className={`relative rounded-lg border-2 p-4 text-left transition-all hover:shadow-md ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/40"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">{theme.name}</h3>
                      {isCurrent && (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {theme.description}
                    </p>
                  </div>

                  {/* Light mode palette */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      Light
                    </span>
                    <div className="flex gap-1.5">
                      {palette.swatches.map((color, i) => (
                        <div
                          key={i}
                          className="h-6 w-6 rounded-full border border-black/10"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Dark mode palette */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      Dark
                    </span>
                    <div className="flex gap-1.5">
                      {palette.darkSwatches.map((color, i) => (
                        <div
                          key={i}
                          className="h-6 w-6 rounded-full border border-white/10"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {hasChanges && (
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={handleApply} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Applying...
                </>
              ) : (
                "Apply Theme"
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setPendingTheme(savedTheme)}
              disabled={isSaving}
            >
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
