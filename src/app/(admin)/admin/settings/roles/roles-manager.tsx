"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";

interface Role {
  id: string;
  name: string;
  description_en: string | null;
  description_ko: string | null;
  is_system: boolean;
  created_at: string;
}

const emptyForm = {
  name: "",
  description_en: "",
  description_ko: "",
};

export function RolesManager() {
  const [mounted, setMounted] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingIsSystem, setEditingIsSystem] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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

  useEffect(() => {
    setMounted(true);
    loadRoles();
  }, [loadRoles]);

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
      // For system roles, only update descriptions
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
    } else {
      const { error } = await supabase
        .from("eckcm_roles")
        .insert({ ...payload, is_system: false });
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Role created");
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
    loadRoles();
  };

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
