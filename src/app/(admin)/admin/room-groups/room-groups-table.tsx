"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DoorOpen, X } from "lucide-react";

interface Event {
  id: string;
  name_en: string;
  year: number;
}

interface Department {
  id: string;
  name_en: string;
}

interface GroupRow {
  id: string;
  display_group_code: string;
  room_assign_status: string;
  key_count: number;
  preferences: Record<string, boolean>;
  member_count: number;
  confirmation_code: string | null;
  registration_status: string;
  assigned_room: string | null;
  assignment_id: string | null;
  department_id: string | null;
  department_name: string | null;
}

interface AvailableRoom {
  id: string;
  room_number: string;
  capacity: number;
  has_ac: boolean;
  is_accessible: boolean;
  floor_name: string;
  building_name: string;
}

export function RoomGroupsTable({ events }: { events: Event[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [assignDialog, setAssignDialog] = useState<GroupRow | null>(null);
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Load departments once
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("eckcm_departments")
        .select("id, name_en")
        .eq("is_active", true)
        .order("sort_order");
      setDepartments(data ?? []);
    })();
  }, []);

  const loadGroups = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const supabase = createClient();

    // Load groups with memberships including department info
    const { data } = await supabase
      .from("eckcm_groups")
      .select(`
        id,
        display_group_code,
        room_assign_status,
        key_count,
        preferences,
        eckcm_registrations!inner(confirmation_code, status),
        eckcm_group_memberships(
          count,
          role,
          eckcm_people(department_id, eckcm_departments(id, name_en))
        ),
        eckcm_room_assignments(id, eckcm_rooms(room_number))
      `)
      .eq("event_id", eventId);

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: GroupRow[] = data.map((g: any) => {
        const assignment = g.eckcm_room_assignments?.[0];
        const memberships = g.eckcm_group_memberships ?? [];

        // Find the representative's department (or first member with a department)
        let departmentId: string | null = null;
        let departmentName: string | null = null;
        for (const m of memberships) {
          if (m.eckcm_people?.eckcm_departments) {
            if (m.role === "REPRESENTATIVE" || !departmentId) {
              departmentId = m.eckcm_people.eckcm_departments.id;
              departmentName = m.eckcm_people.eckcm_departments.name_en;
            }
            if (m.role === "REPRESENTATIVE") break;
          }
        }

        return {
          id: g.id,
          display_group_code: g.display_group_code,
          room_assign_status: g.room_assign_status,
          key_count: g.key_count,
          preferences: g.preferences ?? {},
          member_count: memberships.length,
          confirmation_code: g.eckcm_registrations?.confirmation_code,
          registration_status: g.eckcm_registrations?.status,
          assigned_room: assignment?.eckcm_rooms?.room_number ?? null,
          assignment_id: assignment?.id ?? null,
          department_id: departmentId,
          department_name: departmentName,
        };
      });
      setGroups(rows);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const openAssignDialog = async (group: GroupRow) => {
    setAssignDialog(group);
    setLoadingRooms(true);

    const supabase = createClient();

    const { data: buildings } = await supabase
      .from("eckcm_buildings")
      .select("id, name_en")
      .eq("is_active", true);

    if (!buildings?.length) {
      setAvailableRooms([]);
      setLoadingRooms(false);
      return;
    }

    const buildingIds = buildings.map((b) => b.id);
    const buildingMap = new Map(buildings.map((b) => [b.id, b.name_en]));

    const { data: floors } = await supabase
      .from("eckcm_floors")
      .select("id, building_id, floor_number, name_en")
      .in("building_id", buildingIds);

    if (!floors?.length) {
      setAvailableRooms([]);
      setLoadingRooms(false);
      return;
    }

    const floorIds = floors.map((f) => f.id);
    const floorMap = new Map(
      floors.map((f) => [
        f.id,
        { name: f.name_en || `Floor ${f.floor_number}`, buildingId: f.building_id },
      ])
    );

    const { data: allRooms } = await supabase
      .from("eckcm_rooms")
      .select("id, floor_id, room_number, capacity, has_ac, is_accessible, is_available")
      .in("floor_id", floorIds)
      .eq("is_available", true)
      .order("room_number");

    // Filter out already-assigned rooms
    const { data: assignments } = await supabase
      .from("eckcm_room_assignments")
      .select("room_id");

    const assignedRoomIds = new Set((assignments ?? []).map((a) => a.room_id));

    const available: AvailableRoom[] = (allRooms ?? [])
      .filter((r) => !assignedRoomIds.has(r.id))
      .map((r) => {
        const floorInfo = floorMap.get(r.floor_id);
        return {
          id: r.id,
          room_number: r.room_number,
          capacity: r.capacity,
          has_ac: r.has_ac,
          is_accessible: r.is_accessible,
          floor_name: floorInfo?.name ?? "Unknown",
          building_name: buildingMap.get(floorInfo?.buildingId ?? "") ?? "Unknown",
        };
      });

    setAvailableRooms(available);
    setLoadingRooms(false);
  };

  const assignRoom = async (roomId: string) => {
    if (!assignDialog) return;
    const supabase = createClient();

    const { error } = await supabase.from("eckcm_room_assignments").insert({
      group_id: assignDialog.id,
      room_id: roomId,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    await supabase
      .from("eckcm_groups")
      .update({ room_assign_status: "ASSIGNED" })
      .eq("id", assignDialog.id);

    toast.success("Room assigned");
    setAssignDialog(null);
    loadGroups();
  };

  const unassignRoom = async (group: GroupRow) => {
    if (!group.assignment_id) return;
    const supabase = createClient();

    const { error } = await supabase
      .from("eckcm_room_assignments")
      .delete()
      .eq("id", group.assignment_id);

    if (error) {
      toast.error(error.message);
      return;
    }

    await supabase
      .from("eckcm_groups")
      .update({ room_assign_status: "PENDING" })
      .eq("id", group.id);

    toast.success("Room unassigned");
    loadGroups();
  };

  // ─── Filtered groups ────────────────────────────────────────────

  const filtered = groups.filter((g) => {
    if (departmentFilter === "ALL") return true;
    if (departmentFilter === "NONE") return !g.department_id;
    return g.department_id === departmentFilter;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Room Groups</h1>

      <div className="flex flex-wrap gap-3">
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="w-[250px]">
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

        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Departments</SelectItem>
            <SelectItem value="NONE">No Department</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {filtered.length} group(s)
            {filtered.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({filtered.filter((g) => g.room_assign_status === "ASSIGNED").length} assigned)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group Code</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Keys</TableHead>
                  <TableHead>Preferences</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reg Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-mono text-sm">
                      {g.display_group_code}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {g.department_name ?? (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{g.member_count}</TableCell>
                    <TableCell>{g.key_count}</TableCell>
                    <TableCell className="text-xs">
                      {[
                        g.preferences.elderly && "Elderly",
                        g.preferences.handicapped && "Accessible",
                        g.preferences.firstFloor && "1F",
                      ]
                        .filter(Boolean)
                        .join(", ") || "-"}
                    </TableCell>
                    <TableCell>
                      {g.assigned_room ? (
                        <Badge variant="default" className="font-mono gap-1">
                          <DoorOpen className="size-3" />
                          {g.assigned_room}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          g.room_assign_status === "ASSIGNED" ? "default" : "outline"
                        }
                      >
                        {g.room_assign_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          g.registration_status === "PAID" ? "default" : "secondary"
                        }
                      >
                        {g.registration_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {g.assigned_room ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => unassignRoom(g)}
                        >
                          <X className="mr-1 size-3" />
                          Unassign
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => openAssignDialog(g)}
                        >
                          <DoorOpen className="mr-1 size-3" />
                          Assign
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center text-muted-foreground py-8"
                    >
                      No groups found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Room Assignment Dialog */}
      <Dialog
        open={!!assignDialog}
        onOpenChange={(open) => !open && setAssignDialog(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Assign Room to {assignDialog?.display_group_code}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {assignDialog?.member_count} member(s) |{" "}
              {[
                assignDialog?.preferences?.elderly && "Elderly",
                assignDialog?.preferences?.handicapped && "Accessible",
                assignDialog?.preferences?.firstFloor && "1st Floor",
              ]
                .filter(Boolean)
                .join(", ") || "No preferences"}
            </p>

            {loadingRooms ? (
              <p className="text-center text-muted-foreground py-8">
                Loading available rooms...
              </p>
            ) : availableRooms.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No available rooms. Add rooms in Settings &gt; Lodging first.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Building</TableHead>
                    <TableHead>Floor</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Features</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableRooms.map((room) => (
                    <TableRow key={room.id}>
                      <TableCell className="text-sm">
                        {room.building_name}
                      </TableCell>
                      <TableCell className="text-sm">
                        {room.floor_name}
                      </TableCell>
                      <TableCell className="font-mono">
                        {room.room_number}
                      </TableCell>
                      <TableCell>{room.capacity}</TableCell>
                      <TableCell className="text-xs">
                        {[room.has_ac && "A/C", room.is_accessible && "Accessible"]
                          .filter(Boolean)
                          .join(", ") || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          className="h-7"
                          onClick={() => assignRoom(room.id)}
                        >
                          Assign
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
