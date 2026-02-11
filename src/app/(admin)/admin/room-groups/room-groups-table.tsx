"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";

interface Event {
  id: string;
  name_en: string;
  year: number;
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
}

export function RoomGroupsTable({ events }: { events: Event[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadGroups = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("eckcm_groups")
      .select(`
        id,
        display_group_code,
        room_assign_status,
        key_count,
        preferences,
        eckcm_registrations!inner(confirmation_code, status),
        eckcm_group_memberships(count)
      `)
      .eq("event_id", eventId);

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: GroupRow[] = data.map((g: any) => ({
        id: g.id,
        display_group_code: g.display_group_code,
        room_assign_status: g.room_assign_status,
        key_count: g.key_count,
        preferences: g.preferences ?? {},
        member_count: g.eckcm_group_memberships?.[0]?.count ?? 0,
        confirmation_code: g.eckcm_registrations?.confirmation_code,
        registration_status: g.eckcm_registrations?.status,
      }));
      setGroups(rows);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Room Groups</h1>

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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{groups.length} group(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group Code</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Keys</TableHead>
                  <TableHead>Preferences</TableHead>
                  <TableHead>Room Status</TableHead>
                  <TableHead>Reg Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-mono text-sm">
                      {g.display_group_code}
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
                      <Badge
                        variant={
                          g.room_assign_status === "ASSIGNED"
                            ? "default"
                            : "outline"
                        }
                      >
                        {g.room_assign_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          g.registration_status === "PAID"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {g.registration_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {groups.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
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
    </div>
  );
}
