"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { toast } from "sonner";
import { Shield } from "lucide-react";

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
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const [selectedRoleId, setSelectedRoleId] = useState("");

  // Mounted guard for Radix hydration
  useState(() => {
    setMounted(true);
  });

  // Get unique roles for filter tabs
  const roleNames = Array.from(new Set(roles.map((r) => r.name)));

  const filtered = initialUsers.filter((u) => {
    const matchesSearch =
      !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      `${u.firstName ?? ""} ${u.lastName ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleAssignStaffRole = async () => {
    if (!selectedUserId || !selectedEventId || !selectedRoleId) {
      toast.error("Please fill all fields");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("eckcm_staff_assignments").insert({
      user_id: selectedUserId,
      event_id: selectedEventId,
      role_id: selectedRoleId,
    });

    if (error) {
      if (error.code === "23505") {
        toast.error("This user already has this role for this event");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Staff role assigned");
    setAssignOpen(false);
    router.refresh();
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
      <Input
        placeholder="Search by name or email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
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
          <CardTitle className="text-base">
            {filtered.length} user(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Providers</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.firstName && user.lastName
                        ? `${user.firstName} ${user.lastName}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.role}</Badge>
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
                                  {roles.map((r) => (
                                    <SelectItem key={r.id} value={r.id}>
                                      {r.name}
                                      {r.description_en
                                        ? ` - ${r.description_en}`
                                        : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
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
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
