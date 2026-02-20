"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import { Plus, Pencil, Trash2, PlaneLanding, PlaneTakeoff } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";

interface AirportRide {
  id: string;
  event_id: string;
  direction: "PICKUP" | "DROPOFF";
  scheduled_at: string;
  label: string | null;
  origin: string | null;
  destination: string | null;
  is_active: boolean;
}

interface EventOption {
  id: string;
  name_en: string;
}

const emptyForm = {
  direction: "PICKUP" as "PICKUP" | "DROPOFF",
  date: "",
  time: "",
  label: "",
  origin: "",
  destination: "",
  is_active: true,
};

export function AirportRidesManager() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [rides, setRides] = useState<AirportRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Load events on mount
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("eckcm_events")
        .select("id, name_en")
        .eq("is_active", true)
        .order("year", { ascending: false });
      setEvents(data ?? []);
      if (data && data.length > 0) {
        setSelectedEventId(data[0].id);
      }
      setLoading(false);
    })();
  }, []);

  const loadRides = useCallback(async () => {
    if (!selectedEventId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_airport_rides")
      .select("*")
      .eq("event_id", selectedEventId)
      .order("scheduled_at");
    setRides(data ?? []);
  }, [selectedEventId]);

  useEffect(() => {
    loadRides();
  }, [loadRides]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (ride: AirportRide) => {
    setEditingId(ride.id);
    const dt = new Date(ride.scheduled_at);
    setForm({
      direction: ride.direction,
      date: dt.toISOString().slice(0, 10),
      time: dt.toISOString().slice(11, 16),
      label: ride.label ?? "",
      origin: ride.origin ?? "",
      destination: ride.destination ?? "",
      is_active: ride.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.date || !form.time) {
      toast.error("Date and time are required");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const scheduledAt = new Date(`${form.date}T${form.time}:00`).toISOString();
    const payload = {
      event_id: selectedEventId,
      direction: form.direction,
      scheduled_at: scheduledAt,
      label: form.label.trim() || null,
      origin: form.origin.trim() || null,
      destination: form.destination.trim() || null,
      is_active: form.is_active,
    };

    if (editingId) {
      const { error } = await supabase
        .from("eckcm_airport_rides")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Ride updated");
    } else {
      const { error } = await supabase
        .from("eckcm_airport_rides")
        .insert(payload);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Ride created");
    }

    setSaving(false);
    setDialogOpen(false);
    loadRides();
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_airport_rides")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Ride deleted");
    loadRides();
  };

  const handleToggleActive = async (ride: AirportRide) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_airport_rides")
      .update({ is_active: !ride.is_active })
      .eq("id", ride.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    loadRides();
  };

  const formatDateTime = (iso: string) => {
    const dt = new Date(iso);
    return dt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  if (loading) {
    return (
      <p className="text-center text-muted-foreground py-8">Loading...</p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Define available airport pickup and drop-off rides for each event.
        Registrants will be able to select from these during registration.
      </p>

      {/* Event selector + Add Ride button */}
      <div className="flex items-center gap-3">
        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Select event" />
          </SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} disabled={!selectedEventId}>
              <Plus className="mr-2 size-4" />
              Add Ride
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Edit Ride" : "Add Ride"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Direction */}
              <div className="space-y-1">
                <Label>Direction *</Label>
                <Select
                  value={form.direction}
                  onValueChange={(v) =>
                    setForm({ ...form, direction: v as "PICKUP" | "DROPOFF" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PICKUP">Pickup (Airport → Camp)</SelectItem>
                    <SelectItem value="DROPOFF">Drop-off (Camp → Airport)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Origin & Destination */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Origin</Label>
                  <Input
                    value={form.origin}
                    onChange={(e) => setForm({ ...form, origin: e.target.value })}
                    placeholder={form.direction === "PICKUP" ? "e.g., JFK Airport" : "e.g., Camp Berkshire"}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Destination</Label>
                  <Input
                    value={form.destination}
                    onChange={(e) => setForm({ ...form, destination: e.target.value })}
                    placeholder={form.direction === "PICKUP" ? "e.g., Camp Berkshire" : "e.g., JFK Airport"}
                  />
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Time *</Label>
                  <Input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                  />
                </div>
              </div>

              {/* Label */}
              <div className="space-y-1">
                <Label>Label (optional)</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g., JFK Morning Pickup"
                />
              </div>

              {/* Active */}
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, is_active: checked })
                  }
                />
                <Label>Active</Label>
              </div>

              <Button
                onClick={handleSave}
                className="w-full"
                disabled={saving}
              >
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Rides table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Direction</TableHead>
            <TableHead>Route</TableHead>
            <TableHead>Date & Time</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rides.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center text-muted-foreground py-8"
              >
                No rides yet. Click &quot;Add Ride&quot; to create one.
              </TableCell>
            </TableRow>
          ) : (
            rides.map((ride) => (
              <TableRow key={ride.id}>
                <TableCell>
                  <Badge
                    variant={ride.direction === "PICKUP" ? "default" : "secondary"}
                    className="gap-1"
                  >
                    {ride.direction === "PICKUP" ? (
                      <PlaneLanding className="size-3" />
                    ) : (
                      <PlaneTakeoff className="size-3" />
                    )}
                    {ride.direction === "PICKUP" ? "Pickup" : "Drop-off"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ride.origin || ride.destination
                    ? `${ride.origin ?? "—"} → ${ride.destination ?? "—"}`
                    : "—"}
                </TableCell>
                <TableCell>{formatDateTime(ride.scheduled_at)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {ride.label || "—"}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={ride.is_active}
                    onCheckedChange={() => handleToggleActive(ride)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(ride)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(ride.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
        title="Delete ride?"
        description="This will permanently delete this ride. Any registrants who selected it will lose this selection."
      />
    </div>
  );
}
