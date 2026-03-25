"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime, useChangeDetector } from "@/lib/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";
import { logActivity } from "@/lib/audit-client";

interface Role {
  id: string;
  name: string;
  description_en: string | null;
  description_ko: string | null;
  is_system: boolean;
  created_at: string;
}

interface Permission {
  id: string;
  code: string;
  description_en: string | null;
  category: string;
}

const emptyForm = {
  name: "",
  description_en: "",
  description_ko: "",
};

const CATEGORY_LABELS: Record<string, string> = {
  audit: "Audit",
  checkin: "Check-in",
  event: "Events",
  group: "Groups",
  invoice: "Invoices",
  links: "Links",
  lodging: "Lodging",
  participant: "Participants",
  payment: "Payments",
  print: "Printing",
  settings: "Settings",
  user: "Users",
};

export function RolesManager() {
  const [mounted, setMounted] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit role dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingIsSystem, setEditingIsSystem] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Permissions dialog
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [permsDialogOpen, setPermsDialogOpen] = useState(false);
  const [permsRole, setPermsRole] = useState<Role | null>(null);
  const [selectedPermIds, setSelectedPermIds] = useState<Set<string>>(new Set());
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_roles")
      .select("*")
      .order("name");
    setRoles(data ?? []);
    setLoading(false);
  }, []);

  // Load all available permissions once
  const loadAllPermissions = useCallback(async () => {
    if (allPermissions.length > 0) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_permissions")
      .select("id, code, description_en, category")
      .order("category")
      .order("code");
    setAllPermissions(data ?? []);
  }, [allPermissions.length]);

  useEffect(() => {
    setMounted(true);
    loadRoles();
    loadAllPermissions();
  }, [loadRoles, loadAllPermissions]);

  // Live updates
  const _reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime({ table: "eckcm_roles", event: "*" }, () => {
    if (_reloadTimer.current) clearTimeout(_reloadTimer.current);
    _reloadTimer.current = setTimeout(loadRoles, 500);
  });
  useRealtime({ table: "eckcm_role_permissions", event: "*" }, () => {
    if (_reloadTimer.current) clearTimeout(_reloadTimer.current);
    _reloadTimer.current = setTimeout(loadRoles, 500);
  });
  useChangeDetector("eckcm_roles", loadRoles, 5000);

  // ── Role create/edit ────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingId(null);
    setEditingIsSystem(false);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditingId(role.id);
    setEditingIsSystem(role.is_system);
    setForm({
      name: role.name,
      description_en: role.description_en ?? "",
      description_ko: role.description_ko ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) {
      toast.error("Role name is required");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload = {
      name: form.name.toUpperCase().replace(/\s+/g, "_"),
      description_en: form.description_en || null,
      description_ko: form.description_ko || null,
    };

    if (editingId) {
      const updatePayload = editingIsSystem
        ? { description_en: payload.description_en, description_ko: payload.description_ko }
        : payload;

      const { error } = await supabase
        .from("eckcm_roles")
        .update(updatePayload)
        .eq("id", editingId);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Role updated");
      logActivity({ action: "UPDATE", entity_type: "role", entity_id: editingId, new_data: payload });
    } else {
      const { data: created, error } = await supabase
        .from("eckcm_roles")
        .insert({ ...payload, is_system: false })
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Role created");
      logActivity({ action: "CREATE", entity_type: "role", entity_id: created?.id, new_data: payload });
    }

    setSaving(false);
    setDialogOpen(false);
    loadRoles();
  };

  const handleDelete = async (id: string) => {
    const role = roles.find((r) => r.id === id);
    if (role?.is_system) {
      toast.error("System roles cannot be deleted");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_roles")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Role deleted");
    logActivity({ action: "DELETE", entity_type: "role", entity_id: id });
    loadRoles();
  };

  // ── Permissions dialog ──────────────────────────────────────────────────────

  const openPermissions = async (role: Role) => {
    setPermsRole(role);
    setLoadingPerms(true);
    setPermsDialogOpen(true);

    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_role_permissions")
      .select("permission_id")
      .eq("role_id", role.id);

    setSelectedPermIds(new Set((data ?? []).map((r) => r.permission_id)));
    setLoadingPerms(false);
  };

  const togglePerm = (permId: string) => {
    setSelectedPermIds((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  const toggleCategory = (categoryPerms: Permission[]) => {
    const allSelected = categoryPerms.every((p) => selectedPermIds.has(p.id));
    setSelectedPermIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        categoryPerms.forEach((p) => next.delete(p.id));
      } else {
        categoryPerms.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  const savePermissions = async () => {
    if (!permsRole) return;
    setSavingPerms(true);
    const supabase = createClient();

    // Replace all permissions for this role atomically
    const { error: delErr } = await supabase
      .from("eckcm_role_permissions")
      .delete()
      .eq("role_id", permsRole.id);

    if (delErr) {
      toast.error(delErr.message);
      setSavingPerms(false);
      return;
    }

    if (selectedPermIds.size > 0) {
      const rows = [...selectedPermIds].map((permissionId) => ({
        role_id: permsRole.id,
        permission_id: permissionId,
      }));
      const { error: insErr } = await supabase
        .from("eckcm_role_permissions")
        .insert(rows);
      if (insErr) {
        toast.error(insErr.message);
        setSavingPerms(false);
        return;
      }
    }

    toast.success(`Permissions updated for ${permsRole.name}`);
    logActivity({
      action: "UPDATE",
      entity_type: "role_permissions",
      entity_id: permsRole.id,
      new_data: { permission_count: selectedPermIds.size },
    });

    setSavingPerms(false);
    setPermsDialogOpen(false);
  };

  // Group permissions by category for the dialog
  const permsByCategory = allPermissions.reduce<Record<string, Permission[]>>(
    (acc, p) => {
      (acc[p.category] ??= []).push(p);
      return acc;
    },
    {}
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!mounted) {
    return (
      <div className="space-y-4">
        <p className="text-center text-muted-foreground py-8">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              New Role
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Edit Role" : "Create Role"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value.toUpperCase().replace(/\s+/g, "_") })
                  }
                  placeholder="EVENT_ADMIN"
                  disabled={editingIsSystem}
                />
                {editingIsSystem && (
                  <p className="text-xs text-muted-foreground">
                    System role names cannot be changed
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Description (EN)</Label>
                  <Input
                    value={form.description_en}
                    onChange={(e) =>
                      setForm({ ...form, description_en: e.target.value })
                    }
                    placeholder="Event Administrator"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Description (KO)</Label>
                  <Input
                    value={form.description_ko}
                    onChange={(e) =>
                      setForm({ ...form, description_ko: e.target.value })
                    }
                    placeholder="이벤트 관리자"
                  />
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
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description (EN)</TableHead>
              <TableHead>Description (KO)</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground py-8"
                >
                  No roles yet.
                </TableCell>
              </TableRow>
            ) : (
              roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-mono">{role.name}</TableCell>
                  <TableCell>{role.description_en ?? "—"}</TableCell>
                  <TableCell>{role.description_ko ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={role.is_system ? "default" : "outline"}>
                      {role.is_system ? "System" : "Custom"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Edit permissions"
                      onClick={() => openPermissions(role)}
                    >
                      <ShieldCheck className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(role)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    {!role.is_system && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(role.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {/* Permissions dialog */}
      <Dialog open={permsDialogOpen} onOpenChange={setPermsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Permissions — {permsRole?.name}
            </DialogTitle>
          </DialogHeader>

          {loadingPerms ? (
            <p className="text-center text-muted-foreground py-8">Loading…</p>
          ) : (
            <>
              <div className="overflow-y-auto flex-1 space-y-5 pr-1">
                {Object.entries(permsByCategory).map(([category, perms]) => {
                  const allChecked = perms.every((p) => selectedPermIds.has(p.id));
                  const someChecked = perms.some((p) => selectedPermIds.has(p.id));

                  return (
                    <div key={category}>
                      {/* Category header with select-all */}
                      <div className="flex items-center gap-2 mb-2">
                        <Checkbox
                          id={`cat-${category}`}
                          checked={allChecked}
                          // indeterminate if some (but not all) are selected
                          data-state={allChecked ? "checked" : someChecked ? "indeterminate" : "unchecked"}
                          onCheckedChange={() => toggleCategory(perms)}
                        />
                        <label
                          htmlFor={`cat-${category}`}
                          className="text-sm font-semibold cursor-pointer select-none"
                        >
                          {CATEGORY_LABELS[category] ?? category}
                        </label>
                      </div>

                      {/* Permission rows */}
                      <div className="ml-6 space-y-1.5">
                        {perms.map((perm) => (
                          <div key={perm.id} className="flex items-start gap-2">
                            <Checkbox
                              id={perm.id}
                              checked={selectedPermIds.has(perm.id)}
                              onCheckedChange={() => togglePerm(perm.id)}
                              className="mt-0.5"
                            />
                            <label
                              htmlFor={perm.id}
                              className="text-sm cursor-pointer select-none leading-tight"
                            >
                              <span className="font-mono text-xs text-muted-foreground">
                                {perm.code}
                              </span>
                              {perm.description_en && (
                                <span className="ml-2 text-foreground">
                                  {perm.description_en}
                                </span>
                              )}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <span className="text-sm text-muted-foreground">
                  {selectedPermIds.size} of {allPermissions.length} permissions selected
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPermsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={savePermissions} disabled={savingPerms}>
                    {savingPerms ? "Saving…" : "Save Permissions"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
        title="Delete role?"
        description="This will permanently delete this role. Users with this role will need to be reassigned. This action cannot be undone."
      />
    </div>
  );
}
