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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";

interface RegistrationGroup {
  id: string;
  name_en: string;
  name_ko: string | null;
  description_en: string | null;
  description_ko: string | null;
  access_code: string | null;
  global_registration_fee_cents: number | null;
  global_early_bird_fee_cents: number | null;
  early_bird_deadline: string | null;
  department_id: string | null;
  show_special_preferences: boolean;
  show_key_deposit: boolean;
  only_one_person: boolean;
  is_default: boolean;
  is_active: boolean;
}

interface Department {
  id: string;
  name_en: string;
}

interface FeeCategory {
  id: string;
  code: string;
  name_en: string;
  amount_cents: number;
  pricing_type: string;
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
  department_id: "",
  show_special_preferences: true,
  show_key_deposit: true,
  only_one_person: false,
  is_default: false,
  is_active: true,
};

export function RegistrationGroupsManager() {
  const [groups, setGroups] = useState<RegistrationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Fee category linking
  const [allFees, setAllFees] = useState<FeeCategory[]>([]);
  const [selectedFeeIds, setSelectedFeeIds] = useState<Set<string>>(new Set());
  const [groupFeeMap, setGroupFeeMap] = useState<
    Map<string, string[]>
  >(new Map());
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_registration_groups")
      .select("*")
      .order("created_at");
    setGroups(data ?? []);

    // Load fee category mappings for all groups
    const { data: mappings } = await supabase
      .from("eckcm_registration_group_fee_categories")
      .select("registration_group_id, fee_category_id");

    const map = new Map<string, string[]>();
    for (const m of mappings ?? []) {
      const existing = map.get(m.registration_group_id) ?? [];
      existing.push(m.fee_category_id);
      map.set(m.registration_group_id, existing);
    }
    setGroupFeeMap(map);

    setLoading(false);
  }, []);

  const loadFees = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_fee_categories")
      .select("id, code, name_en, amount_cents, pricing_type")
      .eq("is_active", true)
      .order("sort_order");
    setAllFees(data ?? []);
  }, []);

  const loadDepartments = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_departments")
      .select("id, name_en")
      .eq("is_active", true)
      .order("sort_order");
    setAllDepartments(data ?? []);
  }, []);

  useEffect(() => {
    loadGroups();
    loadFees();
    loadDepartments();
  }, [loadGroups, loadFees, loadDepartments]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setSelectedFeeIds(new Set());
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
      department_id: group.department_id ?? "",
      show_special_preferences: group.show_special_preferences,
      show_key_deposit: group.show_key_deposit,
      only_one_person: group.only_one_person,
      is_default: group.is_default,
      is_active: group.is_active,
    });
    setSelectedFeeIds(new Set(groupFeeMap.get(group.id) ?? []));
    setDialogOpen(true);
  };

  const toggleFee = (feeId: string) => {
    setSelectedFeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(feeId)) {
        next.delete(feeId);
      } else {
        next.add(feeId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!form.name_en) {
      toast.error("Name (English) is required");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload = {
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
      department_id: form.department_id || null,
      show_special_preferences: form.show_special_preferences,
      show_key_deposit: form.show_key_deposit,
      only_one_person: form.only_one_person,
      is_default: form.is_default,
      is_active: form.is_active,
    };

    let groupId = editingId;

    if (editingId) {
      const { error } = await supabase
        .from("eckcm_registration_groups")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("eckcm_registration_groups")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      groupId = data.id;
    }

    // Sync fee category mappings
    if (groupId) {
      // Delete existing mappings
      await supabase
        .from("eckcm_registration_group_fee_categories")
        .delete()
        .eq("registration_group_id", groupId);

      // Insert new mappings
      if (selectedFeeIds.size > 0) {
        const mappings = Array.from(selectedFeeIds).map((feeId) => ({
          registration_group_id: groupId,
          fee_category_id: feeId,
        }));
        const { error: mapError } = await supabase
          .from("eckcm_registration_group_fee_categories")
          .insert(mappings);
        if (mapError) {
          toast.error("Group saved but fee mapping failed: " + mapError.message);
          setSaving(false);
          setDialogOpen(false);
          loadGroups();
          return;
        }
      }
    }

    toast.success(editingId ? "Group updated" : "Group created");
    setSaving(false);
    setDialogOpen(false);
    loadGroups();
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_registration_groups")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Group deleted");
    loadGroups();
  };

  const formatCents = (cents: number | null) => {
    if (cents == null) return "-";
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getLinkedFeeNames = (groupId: string) => {
    const feeIds = groupFeeMap.get(groupId) ?? [];
    return feeIds
      .map((id) => allFees.find((f) => f.id === id)?.name_en)
      .filter(Boolean);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              New Group
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                    setForm({ ...form, access_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })
                  }
                  placeholder="Leave empty for public group"
                />
              </div>
              <div className="space-y-1">
                <Label>Activate by Group Representative Department (optional)</Label>
                <Select
                  value={form.department_id}
                  onValueChange={(v) =>
                    setForm({ ...form, department_id: v === "__none__" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None — not activated" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {allDepartments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  When set, this group is auto-assigned if Room Group 1 representative selects this department.
                </p>
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
              <div className="flex flex-wrap items-center gap-6">
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
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.show_special_preferences}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, show_special_preferences: checked })
                    }
                  />
                  <Label>Special Preferences</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.show_key_deposit}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, show_key_deposit: checked })
                    }
                  />
                  <Label>Key Deposit</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.only_one_person}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, only_one_person: checked })
                    }
                  />
                  <Label>Only One Person</Label>
                </div>
              </div>

              {/* Fee Category Linking */}
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm font-medium">Fee Categories</Label>
                <p className="text-xs text-muted-foreground">
                  Select which fee categories apply to this group
                </p>
                <div className="space-y-2 rounded-md border p-3">
                  {allFees.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No fee categories available
                    </p>
                  ) : (
                    allFees.map((fee) => (
                      <div
                        key={fee.id}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={selectedFeeIds.has(fee.id)}
                            onCheckedChange={() => toggleFee(fee.id)}
                          />
                          <span className="text-sm">{fee.name_en}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          ${(fee.amount_cents / 100).toFixed(2)}{" "}
                          <Badge variant="outline" className="text-xs ml-1">
                            {fee.pricing_type}
                          </Badge>
                        </span>
                      </div>
                    ))
                  )}
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
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Loading...</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No registration groups yet. Create your first group.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {groups.map((group) => {
            const linkedFees = getLinkedFeeNames(group.id);
            return (
              <Card key={group.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">
                        {group.name_en}
                      </CardTitle>
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
                        <Badge variant="outline">
                          Code: {group.access_code}
                        </Badge>
                      )}
                      {group.department_id && (
                        <Badge variant="outline">
                          Dept: {allDepartments.find((d) => d.id === group.department_id)?.name_en ?? "—"}
                        </Badge>
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
                        onClick={() => setDeleteTarget(group.id)}
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
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="flex gap-6">
                      <span>
                        Reg Fee:{" "}
                        {formatCents(group.global_registration_fee_cents)}
                      </span>
                      <span>
                        Early Bird:{" "}
                        {formatCents(group.global_early_bird_fee_cents)}
                      </span>
                      {group.early_bird_deadline && (
                        <span>
                          Deadline:{" "}
                          {new Date(
                            group.early_bird_deadline
                          ).toLocaleDateString("en-US")}
                        </span>
                      )}
                    </div>
                    {linkedFees.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {linkedFees.map((name) => (
                          <Badge key={name} variant="outline" className="text-xs">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
        title="Delete registration group?"
        description="This will permanently delete this registration group and its fee category mappings. This action cannot be undone."
      />
    </div>
  );
}
