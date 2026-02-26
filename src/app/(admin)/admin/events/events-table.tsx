"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Star, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";

interface Event {
  id: string;
  name_en: string;
  name_ko: string | null;
  year: number;
  event_start_date: string;
  event_end_date: string;
  registration_start_date: string | null;
  registration_end_date: string | null;
  location: string | null;
  is_active: boolean;
  is_default: boolean;
}

export function EventsTable({ events: initial }: { events: Event[] }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [events, setEvents] = useState(initial);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => setMounted(true), []);
  const [deleteTarget, setDeleteTarget] = useState<Event | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name_en: "",
    name_ko: "",
    year: new Date().getFullYear(),
    event_start_date: "",
    event_end_date: "",
    location: "",
  });

  const handleCreate = async () => {
    if (!form.name_en || !form.event_start_date || !form.event_end_date) {
      toast.error("Please fill in required fields");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("eckcm_events")
      .insert({
        name_en: form.name_en,
        name_ko: form.name_ko || null,
        year: form.year,
        event_start_date: form.event_start_date,
        event_end_date: form.event_end_date,
        location: form.location || null,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    setEvents([data, ...events]);
    setDialogOpen(false);
    setForm({
      name_en: "",
      name_ko: "",
      year: new Date().getFullYear(),
      event_start_date: "",
      event_end_date: "",
      location: "",
    });
    setSaving(false);
    toast.success("Event created");
    router.refresh();
  };

  const toggleActive = async (event: Event) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_events")
      .update({ is_active: !event.is_active })
      .eq("id", event.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setEvents(
      events.map((e) =>
        e.id === event.id ? { ...e, is_active: !e.is_active } : e
      )
    );
    toast.success(
      event.is_active ? "Event deactivated" : "Event activated"
    );
  };

  const setDefault = async (event: Event) => {
    if (event.is_default) return;
    const supabase = createClient();
    // Unset current default first, then set new one
    const { error: unsetError } = await supabase
      .from("eckcm_events")
      .update({ is_default: false })
      .eq("is_default", true);
    if (unsetError) {
      toast.error(unsetError.message);
      return;
    }
    const { error } = await supabase
      .from("eckcm_events")
      .update({ is_default: true })
      .eq("id", event.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEvents(
      events.map((e) => ({ ...e, is_default: e.id === event.id }))
    );
    toast.success(`"${event.name_en}" set as default event`);
    router.refresh();
  };

  const handleDelete = async (event: Event) => {
    setDeleting(true);
    const res = await fetch(`/api/admin/events/${event.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setDeleting(false);

    if (!res.ok) {
      toast.error(data.error ?? "Failed to delete event");
      return;
    }

    setEvents(events.filter((e) => e.id !== event.id));
    toast.success(`"${event.name_en}" deleted`);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">All Events</h2>
        {mounted ? (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 size-4" />
                New Event
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Event</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Name (English) *</Label>
                  <Input
                    value={form.name_en}
                    onChange={(e) =>
                      setForm({ ...form, name_en: e.target.value })
                    }
                    placeholder="ECKCM 2026"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Name (Korean)</Label>
                  <Input
                    value={form.name_ko}
                    onChange={(e) =>
                      setForm({ ...form, name_ko: e.target.value })
                    }
                    placeholder="2026 동부한인교회 수양회"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Year *</Label>
                  <Input
                    type="number"
                    value={form.year}
                    onChange={(e) =>
                      setForm({ ...form, year: parseInt(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Start Date *</Label>
                  <Input
                    type="date"
                    value={form.event_start_date}
                    onChange={(e) =>
                      setForm({ ...form, event_start_date: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>End Date *</Label>
                  <Input
                    type="date"
                    value={form.event_end_date}
                    onChange={(e) =>
                      setForm({ ...form, event_end_date: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                  placeholder="University of Pittsburgh at Johnstown"
                />
              </div>
              <Button
                onClick={handleCreate}
                className="w-full"
                disabled={saving}
              >
                {saving ? "Creating..." : "Create Event"}
              </Button>
            </div>
            </DialogContent>
          </Dialog>
        ) : (
          <Button disabled>
            <Plus className="mr-2 size-4" />
            New Event
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Year</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Default</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center text-muted-foreground py-8"
              >
                No events yet. Create your first event.
              </TableCell>
            </TableRow>
          ) : (
            events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{event.name_en}</p>
                    {event.name_ko && (
                      <p className="text-sm text-muted-foreground">
                        {event.name_ko}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>{event.year}</TableCell>
                <TableCell>
                  {event.event_start_date} ~ {event.event_end_date}
                </TableCell>
                <TableCell>{event.location ?? "-"}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDefault(event)}
                    disabled={event.is_default}
                    className="p-1"
                  >
                    <Star
                      className={`size-4 ${event.is_default ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                    />
                  </Button>
                </TableCell>
                <TableCell>
                  <Badge variant={event.is_active ? "default" : "secondary"}>
                    {event.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleActive(event)}
                  >
                    {event.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      router.push(`/admin/events/${event.id}`)
                    }
                  >
                    Edit
                  </Button>
                  {!event.is_default && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(event)}
                      disabled={deleting}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {mounted && (
        <ConfirmDeleteDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          onConfirm={() => {
            if (deleteTarget) handleDelete(deleteTarget);
            setDeleteTarget(null);
          }}
          title={`Delete "${deleteTarget?.name_en}"?`}
          description="This will permanently delete this event and all related data (registrations, payments, invoices, check-ins, etc.). This action cannot be undone."
        />
      )}
    </div>
  );
}
