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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";

interface Session {
  id: string;
  event_id: string;
  name_en: string;
  name_ko: string | null;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  is_active: boolean;
}

interface EventOption {
  id: string;
  name_en: string;
}

const emptyForm = {
  name_en: "",
  name_ko: "",
  session_date: "",
  start_time: "",
  end_time: "",
  is_active: true,
};

export function SessionsManager() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("eckcm_events")
        .select("id, name_en")
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("year", { ascending: false });
      setEvents(data ?? []);
      if (data && data.length > 0) {
        setSelectedEventId(data[0].id);
      }
      setLoading(false);
    })();
  }, []);

  const loadSessions = useCallback(async () => {
    if (!selectedEventId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_sessions")
      .select("*")
      .eq("event_id", selectedEventId)
      .order("session_date")
      .order("start_time");
    setSessions(data ?? []);
  }, [selectedEventId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (session: Session) => {
    setEditingId(session.id);
    setForm({
      name_en: session.name_en,
      name_ko: session.name_ko ?? "",
      session_date: session.session_date,
      start_time: session.start_time ?? "",
      end_time: session.end_time ?? "",
      is_active: session.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name_en || !form.session_date) {
      toast.error("Name and date are required");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload = {
      event_id: selectedEventId,
      name_en: form.name_en.trim(),
      name_ko: form.name_ko.trim() || null,
      session_date: form.session_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      is_active: form.is_active,
    };

    if (editingId) {
      const { error } = await supabase
        .from("eckcm_sessions")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Session updated");
    } else {
      const { error } = await supabase
        .from("eckcm_sessions")
        .insert(payload);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Session created");
    }

    setSaving(false);
    setDialogOpen(false);
    loadSessions();
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_sessions")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Session deleted");
    loadSessions();
  };

  const handleToggleActive = async (session: Session) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_sessions")
      .update({ is_active: !session.is_active })
      .eq("id", session.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    loadSessions();
  };

  const formatTime = (time: string | null) => {
    if (!time) return "-";
    const [h, m] = time.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${h12}:${m} ${ampm}`;
  };

  if (loading) {
    return <p className="text-center text-muted-foreground py-8">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Define workshop/meeting sessions for session-based check-in.
        Staff can track attendance per session during the event.
      </p>

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
              Add Session
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Edit Session" : "Add Session"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Name (English) *</Label>
                <Input
                  value={form.name_en}
                  onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  placeholder="e.g., Morning Devotional"
                />
              </div>
              <div className="space-y-1">
                <Label>Name (Korean)</Label>
                <Input
                  value={form.name_ko}
                  onChange={(e) => setForm({ ...form, name_ko: e.target.value })}
                  placeholder="e.g., 조회"
                />
              </div>
              <div className="space-y-1">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={form.session_date}
                  onChange={(e) => setForm({ ...form, session_date: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  />
                </div>
              </div>
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-muted-foreground py-8"
              >
                No sessions yet. Click &quot;Add Session&quot; to create one.
              </TableCell>
            </TableRow>
          ) : (
            sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell>
                  <div>
                    <span className="font-medium">{session.name_en}</span>
                    {session.name_ko && (
                      <span className="ml-2 text-sm text-muted-foreground">
                        {session.name_ko}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {new Date(session.session_date + "T00:00:00").toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", weekday: "short" }
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {formatTime(session.start_time)}
                  {session.end_time && ` - ${formatTime(session.end_time)}`}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={session.is_active}
                    onCheckedChange={() => handleToggleActive(session)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(session)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(session.id)}
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
        title="Delete session?"
        description="This will permanently delete this session. Any check-in records associated with it will be affected."
      />
    </div>
  );
}
