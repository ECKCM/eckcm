"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface RegistrationGroup {
  id: string;
  event_id: string;
  name_en: string;
  name_ko: string | null;
  description_en: string | null;
  description_ko: string | null;
  access_code: string | null;
  global_registration_fee_cents: number | null;
  global_early_bird_fee_cents: number | null;
  early_bird_deadline: string | null;
  is_default: boolean;
  is_active: boolean;
}

const emptyForm = {
  name_en: "",
  name_ko: "",
  description_en: "",
  description_ko: "",
  access_code: "",
  global_registration_fee_cents: "",
  global_early_bird_fee_cents: "",
  early_bird_deadline: "",
  is_default: false,
  is_active: true,
};

export function RegistrationGroupsManager({
  events,
}: {
  events: { id: string; name_en: string; year: number }[];
}) {
  const [selectedEventId, setSelectedEventId] = useState("");
  const [groups, setGroups] = useState<RegistrationGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadGroups = useCallback(async (eventId: string) => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("ECKCM_registration_groups")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at");
    setGroups(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      loadGroups(selectedEventId);
    }
  }, [selectedEventId, loadGroups]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (group: RegistrationGroup) => {
    setEditingId(group.id);
    setForm({
      name_en: group.name_en,
      name_ko: group.name_ko ?? "",
      description_en: group.description_en ?? "",
      description_ko: group.description_ko ?? "",
      access_code: group.access_code ?? "",
      global_registration_fee_cents:
        group.global_registration_fee_cents?.toString() ?? "",
      global_early_bird_fee_cents:
        group.global_early_bird_fee_cents?.toString() ?? "",
      early_bird_deadline: group.early_bird_deadline ?? "",
      is_default: group.is_default,
      is_active: group.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name_en) {
      toast.error("Name (English) is required");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload = {
      event_id: selectedEventId,
      name_en: form.name_en,
      name_ko: form.name_ko || null,
      description_en: form.description_en || null,
      description_ko: form.description_ko || null,
      access_code: form.access_code || null,
      global_registration_fee_cents: form.global_registration_fee_cents
        ? parseInt(form.global_registration_fee_cents)
        : null,
      global_early_bird_fee_cents: form.global_early_bird_fee_cents
        ? parseInt(form.global_early_bird_fee_cents)
        : null,
      early_bird_deadline: form.early_bird_deadline || null,
      is_default: form.is_default,
      is_active: form.is_active,
    };

    if (editingId) {
      const { error } = await supabase
        .from("ECKCM_registration_groups")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Group updated");
    } else {
      const { error } = await supabase
        .from("ECKCM_registration_groups")
        .insert(payload);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Group created");
    }

    setSaving(false);
    setDialogOpen(false);
    loadGroups(selectedEventId);
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("ECKCM_registration_groups")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Group deleted");
    loadGroups(selectedEventId);
  };

  const formatCents = (cents: number | null) => {
    if (cents == null) return "-";
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-64">
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger>
              <SelectValue placeholder="Select event" />
            </SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name_en} ({e.year})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedEventId && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus className="mr-2 size-4" />
                New Group
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Edit Group" : "Create Group"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Name (EN) *</Label>
                    <Input
                      value={form.name_en}
                      onChange={(e) =>
                        setForm({ ...form, name_en: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Name (KO)</Label>
                    <Input
                      value={form.name_ko}
                      onChange={(e) =>
                        setForm({ ...form, name_ko: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Description (EN)</Label>
                    <Textarea
                      value={form.description_en}
                      onChange={(e) =>
                        setForm({ ...form, description_en: e.target.value })
                      }
                      rows={2}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Description (KO)</Label>
                    <Textarea
                      value={form.description_ko}
                      onChange={(e) =>
                        setForm({ ...form, description_ko: e.target.value })
                      }
                      rows={2}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Access Code (optional)</Label>
                  <Input
                    value={form.access_code}
                    onChange={(e) =>
                      setForm({ ...form, access_code: e.target.value })
                    }
                    placeholder="Leave empty for public group"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Registration Fee (cents)</Label>
                    <Input
                      type="number"
                      value={form.global_registration_fee_cents}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          global_registration_fee_cents: e.target.value,
                        })
                      }
                      placeholder="e.g., 15000 = $150"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Early Bird Fee (cents)</Label>
                    <Input
                      type="number"
                      value={form.global_early_bird_fee_cents}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          global_early_bird_fee_cents: e.target.value,
                        })
                      }
                      placeholder="e.g., 12000 = $120"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Early Bird Deadline</Label>
                  <Input
                    type="datetime-local"
                    value={form.early_bird_deadline}
                    onChange={(e) =>
                      setForm({ ...form, early_bird_deadline: e.target.value })
                    }
                  />
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.is_default}
                      onCheckedChange={(checked) =>
                        setForm({ ...form, is_default: checked })
                      }
                    />
                    <Label>Default Group</Label>
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
        )}
      </div>

      {!selectedEventId ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Select an event to manage registration groups.
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading...
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No registration groups yet. Create your first group.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {groups.map((group) => (
            <Card key={group.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{group.name_en}</CardTitle>
                    {group.name_ko && (
                      <span className="text-sm text-muted-foreground">
                        ({group.name_ko})
                      </span>
                    )}
                    {group.is_default && <Badge>Default</Badge>}
                    {!group.is_active && (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                    {group.access_code && (
                      <Badge variant="outline">Code: {group.access_code}</Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(group)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(group.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                {group.description_en && (
                  <CardDescription>{group.description_en}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex gap-6 text-sm">
                  <span>
                    Reg Fee: {formatCents(group.global_registration_fee_cents)}
                  </span>
                  <span>
                    Early Bird: {formatCents(group.global_early_bird_fee_cents)}
                  </span>
                  {group.early_bird_deadline && (
                    <span>
                      Deadline:{" "}
                      {new Date(group.early_bird_deadline).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
