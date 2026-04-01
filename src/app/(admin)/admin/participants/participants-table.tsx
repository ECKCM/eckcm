"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime, useChangeDetector } from "@/lib/hooks/use-realtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import { useTableSort } from "@/lib/hooks/use-table-sort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";

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
  church_other: string | null;
  department_name: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_phone_country: string | null;
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
          email, phone, phone_country, church_other,
          guardian_name, guardian_phone, guardian_phone_country,
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
      .eq("eckcm_groups.event_id", eventId)
      .in("eckcm_groups.eckcm_registrations.status", ["SUBMITTED", "APPROVED", "PAID"]);

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
          church_name: m.eckcm_people.church_other || m.eckcm_people.eckcm_churches?.name_en || null,
          church_other: m.eckcm_people.church_other,
          department_name: m.eckcm_people.eckcm_departments?.name_en ?? null,
          guardian_name: m.eckcm_people.guardian_name ?? null,
          guardian_phone: m.eckcm_people.guardian_phone ?? null,
          guardian_phone_country: m.eckcm_people.guardian_phone_country ?? null,
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

  // Live updates
  const _reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const _reload = () => {
    if (_reloadTimer.current) clearTimeout(_reloadTimer.current);
    _reloadTimer.current = setTimeout(loadParticipants, 500);
  };
  useRealtime({ table: "eckcm_registrations", event: "*", filter: `event_id=eq.${eventId}` }, _reload);
  useRealtime({ table: "eckcm_group_memberships", event: "*" }, _reload);
  useChangeDetector("eckcm_group_memberships", loadParticipants, 5000);

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
      (p.department_name?.toLowerCase().includes(q) ?? false) ||
      (p.guardian_name?.toLowerCase().includes(q) ?? false)
    );
  });

  const { sortedData: sorted, sortConfig, requestSort } = useTableSort(filtered);

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
            {sorted.length} participant(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">
              Loading...
            </p>
          ) : (
            <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead className="whitespace-nowrap" sortKey="first_name_en" sortConfig={sortConfig} onSort={requestSort}>Name</SortableTableHead>
                    <SortableTableHead sortKey="display_name_ko" sortConfig={sortConfig} onSort={requestSort}>Display Name</SortableTableHead>
                    <SortableTableHead sortKey="gender" sortConfig={sortConfig} onSort={requestSort}>Gender</SortableTableHead>
                    <SortableTableHead sortKey="date_of_birth" sortConfig={sortConfig} onSort={requestSort}>DOB</SortableTableHead>
                    <SortableTableHead sortKey="age_at_event" sortConfig={sortConfig} onSort={requestSort}>Age</SortableTableHead>
                    <SortableTableHead sortKey="is_k12" sortConfig={sortConfig} onSort={requestSort}>K-12</SortableTableHead>
                    <SortableTableHead sortKey="grade" sortConfig={sortConfig} onSort={requestSort}>Grade</SortableTableHead>
                    <SortableTableHead sortKey="church_name" sortConfig={sortConfig} onSort={requestSort}>Church</SortableTableHead>
                    <SortableTableHead sortKey="department_name" sortConfig={sortConfig} onSort={requestSort}>Dept</SortableTableHead>
                    <SortableTableHead sortKey="display_group_code" sortConfig={sortConfig} onSort={requestSort}>Group</SortableTableHead>
                    <SortableTableHead sortKey="role_name" sortConfig={sortConfig} onSort={requestSort}>Role</SortableTableHead>
                    <SortableTableHead sortKey="membership_status" sortConfig={sortConfig} onSort={requestSort}>Status</SortableTableHead>
                    <SortableTableHead sortKey="confirmation_code" sortConfig={sortConfig} onSort={requestSort}>Reg Code</SortableTableHead>
                    <SortableTableHead sortKey="participant_code" sortConfig={sortConfig} onSort={requestSort}>P.Code</SortableTableHead>
                    <SortableTableHead sortKey="registration_status" sortConfig={sortConfig} onSort={requestSort}>Reg Status</SortableTableHead>
                    <SortableTableHead sortKey="checked_in" sortConfig={sortConfig} onSort={requestSort}>Check-in</SortableTableHead>
                    <SortableTableHead sortKey="checked_out" sortConfig={sortConfig} onSort={requestSort}>Check-out</SortableTableHead>
                    <SortableTableHead sortKey="nights_count" sortConfig={sortConfig} onSort={requestSort}>Nights</SortableTableHead>
                    <SortableTableHead sortKey="lodging_type" sortConfig={sortConfig} onSort={requestSort}>Lodging</SortableTableHead>
                    <SortableTableHead sortKey="room_numbers" sortConfig={sortConfig} onSort={requestSort}>Room</SortableTableHead>
                    <SortableTableHead sortKey="key_count" sortConfig={sortConfig} onSort={requestSort}>Keys</SortableTableHead>
                    <SortableTableHead sortKey="total_amount_cents" sortConfig={sortConfig} onSort={requestSort}>Amount</SortableTableHead>
                    <SortableTableHead sortKey="email" sortConfig={sortConfig} onSort={requestSort}>Email</SortableTableHead>
                    <SortableTableHead sortKey="phone" sortConfig={sortConfig} onSort={requestSort}>Phone</SortableTableHead>
                    <SortableTableHead sortKey="guardian_name" sortConfig={sortConfig} onSort={requestSort}>Guardian</SortableTableHead>
                    <SortableTableHead sortKey="guardian_phone" sortConfig={sortConfig} onSort={requestSort}>Guardian Phone</SortableTableHead>
                    <SortableTableHead className="whitespace-nowrap" sortKey="created_at" sortConfig={sortConfig} onSort={requestSort}>
                      Registered
                    </SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((p, i) => (
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
                        {p.phone ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {p.guardian_name ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {p.guardian_phone ?? "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatTimestamp(p.registration_created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={27}
                        className="text-center text-muted-foreground py-8"
                      >
                        No participants found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
