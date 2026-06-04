"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtime, useChangeDetector } from "@/lib/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";
import { logActivity } from "@/lib/audit-client";
import { useTableSort } from "@/lib/hooks/use-table-sort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { TitleBadge, TITLE_COLORS, titleTextColor } from "@/components/admin/title-badge";
import { TitleIcon, TITLE_ICON_NAMES } from "@/components/admin/title-icons";

interface ParticipantTitle {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  is_active: boolean;
}

export function ParticipantTitlesManager({
  initialTitles,
}: {
  initialTitles: ParticipantTitle[];
}) {
  const router = useRouter();
  const [titles, setTitles] = useState(initialTitles);

  // Live updates
  const _reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime({ table: "eckcm_participant_titles", event: "*" }, () => {
    if (_reloadTimer.current) clearTimeout(_reloadTimer.current);
    _reloadTimer.current = setTimeout(() => router.refresh(), 500);
  });
  useChangeDetector("eckcm_participant_titles", () => router.refresh(), 5000);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    color: string | null;
    icon: string | null;
    is_active: boolean;
  }>({ name: "", color: null, icon: null, is_active: true });
  const [deleteTarget, setDeleteTarget] = useState<ParticipantTitle | null>(null);

  const reload = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_participant_titles")
      .select("*")
      .order("name");
    setTitles(data ?? []);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", color: null, icon: null, is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (title: ParticipantTitle) => {
    setEditingId(title.id);
    setForm({
      name: title.name,
      color: title.color,
      icon: title.icon,
      is_active: title.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload = {
      name: form.name.trim(),
      color: form.color,
      icon: form.icon,
      is_active: form.is_active,
    };

    if (editingId) {
      const { error } = await supabase
        .from("eckcm_participant_titles")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Title updated");
      logActivity({ action: "UPDATE", entity_type: "participant_title", entity_id: editingId, new_data: payload });
    } else {
      const { data: created, error } = await supabase
        .from("eckcm_participant_titles")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Title added");
      logActivity({ action: "CREATE", entity_type: "participant_title", entity_id: created?.id, new_data: payload });
    }

    setSaving(false);
    setDialogOpen(false);
    router.refresh();
    await reload();
  };

  const handleDelete = async (title: ParticipantTitle) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_participant_titles")
      .delete()
      .eq("id", title.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTitles(titles.filter((t) => t.id !== title.id));
    toast.success("Title deleted");
    logActivity({ action: "DELETE", entity_type: "participant_title", entity_id: title.id });
  };

  const { sortedData: sorted, sortConfig, requestSort } = useTableSort(titles);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          One label per title (any language) — printed as-is on name badges.
          Shared across all events; assign them from the Participants page.
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              Add Title
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Title" : "Add Title"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Title *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="EM Leader / 야영회장"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, color: null })}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full border bg-background text-muted-foreground",
                      form.color === null && "ring-2 ring-ring ring-offset-2"
                    )}
                    title="No color"
                  >
                    {form.color === null && <Check className="size-3.5" />}
                  </button>
                  {TITLE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full border",
                        form.color === c && "ring-2 ring-ring ring-offset-2"
                      )}
                      style={{ backgroundColor: c }}
                      title={c}
                    >
                      {form.color === c && (
                        <Check className="size-3.5" style={{ color: titleTextColor(c) }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Icon (optional)</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, icon: null })}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-md border bg-background text-xs text-muted-foreground",
                      form.icon === null && "ring-2 ring-ring ring-offset-2"
                    )}
                    title="No icon"
                  >
                    {form.icon === null ? <Check className="size-3.5" /> : "—"}
                  </button>
                  {TITLE_ICON_NAMES.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setForm({ ...form, icon: ic })}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md border bg-background",
                        form.icon === ic && "ring-2 ring-ring ring-offset-2"
                      )}
                      title={ic}
                    >
                      <TitleIcon name={ic} className="size-4" />
                    </button>
                  ))}
                </div>
                <div className="pt-1">
                  <span className="text-xs text-muted-foreground">Preview: </span>
                  <TitleBadge
                    name={form.name || "Title"}
                    color={form.color}
                    icon={form.icon}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                />
                <Label>Active</Label>
              </div>
              <Button onClick={handleSave} className="w-full" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Update" : "Add"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={requestSort}>Title</SortableTableHead>
            <SortableTableHead sortKey="is_active" sortConfig={sortConfig} onSort={requestSort}>Status</SortableTableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((title) => (
            <TableRow key={title.id}>
              <TableCell>
                <TitleBadge name={title.name} color={title.color} icon={title.icon} />
              </TableCell>
              <TableCell>
                <Badge variant={title.is_active ? "default" : "secondary"}>
                  {title.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => openEdit(title)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(title)}>
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                No titles yet. Add one to start assigning it to participants.
              </TableCell>
            </TableRow>
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
        title="Delete title?"
        description="This will permanently delete this title and remove it from any participants currently assigned it. This action cannot be undone."
      />
    </div>
  );
}
