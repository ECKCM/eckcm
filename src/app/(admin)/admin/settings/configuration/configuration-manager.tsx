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
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
