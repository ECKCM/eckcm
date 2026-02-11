"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

interface ParticipantRow {
  person_id: string;
  first_name_en: string;
  last_name_en: string;
  display_name_ko: string | null;
  gender: string;
  birth_date: string;
  email: string | null;
  phone: string | null;
  confirmation_code: string | null;
  registration_status: string;
  group_role: string;
  display_group_code: string;
}

export function ParticipantsTable({ events }: { events: Event[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadParticipants = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("ECKCM_group_memberships")
      .select(`
        person_id,
        role,
        ECKCM_people!inner(first_name_en, last_name_en, display_name_ko, gender, birth_date, email, phone),
        ECKCM_groups!inner(
          display_group_code,
          event_id,
          ECKCM_registrations!inner(confirmation_code, status)
        )
      `)
      .eq("ECKCM_groups.event_id", eventId);

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: ParticipantRow[] = data.map((m: any) => ({
        person_id: m.person_id,
        first_name_en: m.ECKCM_people.first_name_en,
        last_name_en: m.ECKCM_people.last_name_en,
        display_name_ko: m.ECKCM_people.display_name_ko,
        gender: m.ECKCM_people.gender,
        birth_date: m.ECKCM_people.birth_date,
        email: m.ECKCM_people.email,
        phone: m.ECKCM_people.phone,
        confirmation_code: m.ECKCM_groups.ECKCM_registrations.confirmation_code,
        registration_status: m.ECKCM_groups.ECKCM_registrations.status,
        group_role: m.role,
        display_group_code: m.ECKCM_groups.display_group_code,
      }));
      setParticipants(rows);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    loadParticipants();
  }, [loadParticipants]);

  const filtered = participants.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.first_name_en.toLowerCase().includes(q) ||
      p.last_name_en.toLowerCase().includes(q) ||
      (p.display_name_ko?.toLowerCase().includes(q) ?? false) ||
      (p.email?.toLowerCase().includes(q) ?? false) ||
      (p.confirmation_code?.toLowerCase().includes(q) ?? false) ||
      p.display_group_code.toLowerCase().includes(q)
    );
  });

  const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    PAID: "default",
    SUBMITTED: "outline",
    CANCELLED: "destructive",
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Participants</h1>

      <div className="flex gap-3">
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

        <Input
          placeholder="Search name, email, code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {filtered.length} participant(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Korean</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>DOB</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p, i) => (
                    <TableRow key={`${p.person_id}-${i}`}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {p.first_name_en} {p.last_name_en}
                      </TableCell>
                      <TableCell>{p.display_name_ko ?? "-"}</TableCell>
                      <TableCell>{p.gender}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.birth_date}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.display_group_code}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {p.group_role}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        {p.confirmation_code ?? "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[p.registration_status] ?? "secondary"}>
                          {p.registration_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{p.email ?? "-"}</TableCell>
                      <TableCell className="text-xs">{p.phone ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        No participants found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
