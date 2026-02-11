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
  auth_provider: string;
  profile_completed: boolean;
  created_at: string;
}

interface Event {
  id: string;
  name_en: string;
  year: number;
}

interface Role {
  id: string;
  name: string;
  description_en: string | null;
}

export function UsersManager({
  users,
  events,
  roles,
}: {
  users: User[];
  events: Event[];
  roles: Role[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const [selectedRoleId, setSelectedRoleId] = useState("");

  const filtered = users.filter((u) => {
    if (!search) return true;
    return u.email.toLowerCase().includes(search.toLowerCase());
  });

  const handleAssignRole = async () => {
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
    toast.success("Role assigned");
    setAssignOpen(false);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
      </div>

      <Input
        placeholder="Search by email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

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
                <TableHead>Email</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell className="capitalize">
                    {user.auth_provider}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={user.profile_completed ? "default" : "secondary"}
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
                          Assign Role
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Assign Role to {user.email}</DialogTitle>
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
                            <Label>Role</Label>
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
                            onClick={handleAssignRole}
                            className="w-full"
                          >
                            Assign
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
