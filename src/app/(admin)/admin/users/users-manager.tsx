"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Pencil, Shield, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";
import { useTableSort } from "@/lib/hooks/use-table-sort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { assignStaffRole, deleteUsers, updateUserName } from "./actions";

interface User {
  id: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  providers: string[];
  profile_completed: boolean;
  created_at: string;
}

interface Role {
  id: string;
  name: string;
  description_en: string | null;
  department_id?: string | null;
  department_name?: string | null;
}

interface Event {
  id: string;
  name_en: string;
  year: number;
}

export function UsersManager({
  users: initialUsers,
  roles,
  events,
}: {
  users: User[];
  roles: Role[];
  events: Event[];
}) {
  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const [selectedRoleId, setSelectedRoleId] = useState("");

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Name editing
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const editingUser = users.find((u) => u.id === editUserId) ?? null;

  const openEditName = (user: User) => {
    setEditUserId(user.id);
    setEditFirstName(user.firstName ?? "");
    setEditLastName(user.lastName ?? "");
  };

  const handleSaveName = async () => {
    if (!editUserId) return;
    setSavingName(true);
    const result = await updateUserName(editUserId, editFirstName, editLastName);
    setSavingName(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Name updated");
    setUsers((prev) =>
      prev.map((u) =>
        u.id === editUserId
          ? {
              ...u,
              firstName: result.firstName ?? u.firstName,
              lastName: result.lastName ?? u.lastName,
            }
          : u
      )
    );
    setEditUserId(null);
  };

  // Mounted guard for Radix hydration
  useState(() => {
    setMounted(true);
  });

  // Get unique roles for filter tabs
  const roleNames = Array.from(new Set(roles.map((r) => r.name)));

  const filtered = users.filter((u) => {
    const matchesSearch =
      !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      `${u.firstName ?? ""} ${u.lastName ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const { sortedData: sorted, sortConfig, requestSort } = useTableSort(filtered);

  const handleAssignStaffRole = async () => {
    if (!selectedUserId || !selectedEventId || !selectedRoleId) {
      toast.error("Please fill all fields");
      return;
    }

    const roleName = selectedRole?.name ?? "";
    const result = await assignStaffRole(
      selectedUserId,
      selectedEventId,
      selectedRoleId,
      roleName
    );

    if (result.error) {
      toast.error(result.error);
      return;
    }

    const deptSuffix = selectedRole?.department_name
      ? ` (${selectedRole.department_name})`
      : "";
    toast.success(`Staff role assigned${deptSuffix}`);
    setAssignOpen(false);
    setUsers((prev) =>
      prev.map((u) =>
        u.id === selectedUserId ? { ...u, role: roleName } : u
      )
    );
  };

  const toggleSelect = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((u) => u.id)));
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    const result = await deleteUsers([...selectedIds]);
    setDeleting(false);
    setDeleteOpen(false);

    if (result.error) {
      toast.error(result.error);
    }
    if (result.deleted > 0) {
      toast.success(`Deleted ${result.deleted} user(s)`);
      setUsers((prev) => prev.filter((u) => !selectedIds.has(u.id)));
      setSelectedIds(new Set());
    }
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
      <SearchInput
        placeholder="Search by name or email..."
        value={search}
        onValueChange={setSearch}
        containerClassName="max-w-sm"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={roleFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setRoleFilter("all")}
        >
          All
        </Button>
        {roleNames.map((name) => (
          <Button
            key={name}
            variant={roleFilter === name ? "default" : "outline"}
            size="sm"
            onClick={() => setRoleFilter(name)}
          >
            {name.charAt(0) + name.slice(1).toLowerCase().replace(/_/g, " ")}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {filtered.length} user(s)
            </CardTitle>
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                disabled={deleting}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                {deleting ? "Deleting..." : `Delete ${selectedIds.size} selected`}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Actions</TableHead>
                <SortableTableHead sortKey="role" sortConfig={sortConfig} onSort={requestSort}>Role</SortableTableHead>
                <SortableTableHead sortKey="firstName" sortConfig={sortConfig} onSort={requestSort}>Name</SortableTableHead>
                <SortableTableHead sortKey="email" sortConfig={sortConfig} onSort={requestSort}>Email</SortableTableHead>
                <TableHead>Providers</TableHead>
                <TableHead>Profile</TableHead>
                <SortableTableHead sortKey="created_at" sortConfig={sortConfig} onSort={requestSort}>Joined</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-8"
                  >
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(user.id)}
                        onCheckedChange={() => toggleSelect(user.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Dialog
                        open={assignOpen && selectedUserId === user.id}
                        onOpenChange={(open) => {
                          setAssignOpen(open);
                          if (open) setSelectedUserId(user.id);
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Shield className="h-3 w-3 mr-1" />
                            Staff Role
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>
                              Assign Staff Role to {user.email}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-2">
                            <div>
                              <Label>Event</Label>
                              <Select
                                value={selectedEventId}
                                onValueChange={setSelectedEventId}
                              >
                                <SelectTrigger>
                                  <SelectValue />
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
                            <div>
                              <Label>Staff Role</Label>
                              <Select
                                value={selectedRoleId}
                                onValueChange={setSelectedRoleId}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                  {roles.map((r) => {
                                    const label = r.department_name
                                      ? `${r.name} — ${r.department_name}`
                                      : r.name;
                                    return (
                                      <SelectItem key={r.id} value={r.id}>
                                        {label}
                                        {r.description_en && !r.department_name
                                          ? ` - ${r.description_en}`
                                          : ""}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                              {selectedRole?.department_name && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Scoped to <strong>{selectedRole.department_name}</strong>.
                                  Re-run with a different role to add another department.
                                </p>
                              )}
                            </div>
                            <Button
                              onClick={handleAssignStaffRole}
                              className="w-full"
                            >
                              Assign
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.role}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <span>
                          {user.firstName && user.lastName
                            ? `${user.firstName} ${user.lastName}`
                            : "—"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground"
                          aria-label="Edit name"
                          onClick={() => openEditName(user)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {user.providers.map((p) => (
                          <Badge
                            key={p}
                            variant="outline"
                            className="capitalize text-xs"
                          >
                            {p}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.profile_completed ? "default" : "secondary"
                        }
                      >
                        {user.profile_completed ? "Complete" : "Incomplete"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString("en-US")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        title={`Delete ${selectedIds.size} user(s)?`}
        description="This will permanently delete the selected user(s) and all their related data (registrations, payments, invoices, etc). This action cannot be undone."
      />

      <Dialog
        open={editUserId !== null}
        onOpenChange={(open) => {
          if (!open) setEditUserId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit Name{editingUser ? ` — ${editingUser.email}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label htmlFor="edit-first-name">First Name</Label>
              <Input
                id="edit-first-name"
                value={editFirstName}
                onChange={(e) => setEditFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-last-name">Last Name</Label>
              <Input
                id="edit-last-name"
                value={editLastName}
                onChange={(e) => setEditLastName(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This updates the user&apos;s profile name (English). Because
              registrations reference this profile, the new name also shows on
              their existing registrations, prints, and e-passes.
            </p>
            <Button
              onClick={handleSaveName}
              className="w-full"
              disabled={savingName || !editFirstName.trim() || !editLastName.trim()}
            >
              {savingName ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
