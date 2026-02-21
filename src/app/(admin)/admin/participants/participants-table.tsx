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
  age_at_event: number | null;
  is_k12: boolean;
  grade: number | null;
  email: string | null;
  phone: string | null;
  phone_country: string | null;
  church_name: string | null;
  department_name: string | null;
  confirmation_code: string | null;
  registration_status: string;
  registration_start: string | null;
  registration_end: string | null;
  nights_count: number | null;
  total_amount_cents: number | null;
  registration_created_at: string | null;
  group_role: string;
  membership_status: string;
  display_group_code: string;
  participant_code: string | null;
  room_assign_status: string | null;
  key_count: number | null;
  lodging_type: string | null;
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
      .from("eckcm_group_memberships")
      .select(`
        person_id,
        role,
        status,
        participant_code,
        eckcm_people!inner(
          first_name_en, last_name_en, display_name_ko,
          gender, birth_date, age_at_event, is_k12, grade,
          email, phone, phone_country,
          eckcm_churches(name_en),
          eckcm_departments(name_en)
        ),
        eckcm_groups!inner(
          display_group_code,
          event_id,
          room_assign_status,
          key_count,
          preferences,
          eckcm_registrations!inner(
            confirmation_code, status,
            start_date, end_date, nights_count,
            total_amount_cents, created_at
          )
        )
      `)
      .eq("eckcm_groups.event_id", eventId);

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: ParticipantRow[] = data.map((m: any) => {
        const prefs = m.eckcm_groups.preferences;
        const lodgingType =
          prefs && typeof prefs === "object" ? prefs.lodgingType ?? null : null;

        return {
          person_id: m.person_id,
          first_name_en: m.eckcm_people.first_name_en,
          last_name_en: m.eckcm_people.last_name_en,
          display_name_ko: m.eckcm_people.display_name_ko,
          gender: m.eckcm_people.gender,
          birth_date: m.eckcm_people.birth_date,
          age_at_event: m.eckcm_people.age_at_event,
          is_k12: m.eckcm_people.is_k12 ?? false,
          grade: m.eckcm_people.grade,
          email: m.eckcm_people.email,
          phone: m.eckcm_people.phone,
          phone_country: m.eckcm_people.phone_country,
          church_name: m.eckcm_people.eckcm_churches?.name_en ?? null,
          department_name: m.eckcm_people.eckcm_departments?.name_en ?? null,
          confirmation_code:
            m.eckcm_groups.eckcm_registrations.confirmation_code,
          registration_status: m.eckcm_groups.eckcm_registrations.status,
          registration_start: m.eckcm_groups.eckcm_registrations.start_date,
          registration_end: m.eckcm_groups.eckcm_registrations.end_date,
          nights_count: m.eckcm_groups.eckcm_registrations.nights_count,
          total_amount_cents:
            m.eckcm_groups.eckcm_registrations.total_amount_cents,
          registration_created_at:
            m.eckcm_groups.eckcm_registrations.created_at,
          group_role: m.role,
          membership_status: m.status,
          display_group_code: m.eckcm_groups.display_group_code,
          participant_code: m.participant_code,
          room_assign_status: m.eckcm_groups.room_assign_status,
          key_count: m.eckcm_groups.key_count,
          lodging_type: lodgingType,
        };
      });
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
      (p.phone?.includes(q) ?? false) ||
      (p.confirmation_code?.toLowerCase().includes(q) ?? false) ||
      (p.participant_code?.toLowerCase().includes(q) ?? false) ||
      p.display_group_code.toLowerCase().includes(q) ||
      (p.church_name?.toLowerCase().includes(q) ?? false) ||
      (p.department_name?.toLowerCase().includes(q) ?? false)
    );
  });

  const statusVariant: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    PAID: "default",
    SUBMITTED: "outline",
    DRAFT: "secondary",
    CANCELLED: "destructive",
  };

  function formatLodging(type: string | null) {
    if (!type) return "-";
    return type.replace("LODGING_", "").replace(/_/g, " ");
  }

  function formatDate(d: string | null) {
    if (!d) return "-";
    return d;
  }

  function formatMoney(cents: number | null) {
    if (cents == null) return "-";
    return `$${(cents / 100).toFixed(2)}`;
  }

  function formatTimestamp(ts: string | null) {
    if (!ts) return "-";
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

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
          placeholder="Search name, email, phone, church, code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
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
            <p className="text-center text-muted-foreground py-8">
              Loading...
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Name</TableHead>
                    <TableHead>Korean</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>DOB</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>K-12</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Church</TableHead>
                    <TableHead>Dept</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reg Code</TableHead>
                    <TableHead>P.Code</TableHead>
                    <TableHead>Reg Status</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Check-out</TableHead>
                    <TableHead>Nights</TableHead>
                    <TableHead>Lodging</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Keys</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="whitespace-nowrap">
                      Registered
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p, i) => (
                    <TableRow key={`${p.person_id}-${i}`}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {p.first_name_en} {p.last_name_en}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {p.display_name_ko ?? "-"}
                      </TableCell>
                      <TableCell>{p.gender}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {p.birth_date}
                      </TableCell>
                      <TableCell>{p.age_at_event ?? "-"}</TableCell>
                      <TableCell>{p.is_k12 ? "Y" : "-"}</TableCell>
                      <TableCell>{p.grade ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {p.church_name ?? "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {p.department_name ?? "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.display_group_code}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {p.group_role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {p.membership_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.confirmation_code ?? "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.participant_code ?? "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            statusVariant[p.registration_status] ?? "secondary"
                          }
                        >
                          {p.registration_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDate(p.registration_start)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDate(p.registration_end)}
                      </TableCell>
                      <TableCell>{p.nights_count ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatLodging(p.lodging_type)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.room_assign_status ?? "-"}
                      </TableCell>
                      <TableCell>{p.key_count ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {formatMoney(p.total_amount_cents)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.email ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {p.phone
                          ? `${p.phone_country ? `+${p.phone_country} ` : ""}${p.phone}`
                          : "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatTimestamp(p.registration_created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={24}
                        className="text-center text-muted-foreground py-8"
                      >
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
