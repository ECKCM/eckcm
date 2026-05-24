"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { Users, User, UserCheck, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { exportDepartmentToExcel, exportDepartmentToPdf, type ExportRow } from "./export";

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
  church_name: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  confirmation_code: string | null;
  registration_status: string;
  registration_created_at: string | null;
  registration_start: string | null;
  registration_end: string | null;
  nights_count: number | null;
  additional_requests: string | null;
  group_role: string;
  membership_status: string;
  display_group_code: string;
  participant_code: string | null;
  lodging_type: string | null;
  room_number: string | null;
}

export function DepartmentParticipantsTable({
  departmentId,
  departmentName,
  events,
}: {
  departmentId: string;
  departmentName: string;
  events: Event[];
}) {
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
          email, phone, church_other,
          guardian_name, guardian_phone,
          department_id,
          eckcm_churches(name_en)
        ),
        eckcm_groups!inner(
          display_group_code,
          event_id,
          preferences,
          lodging_type,
          eckcm_registrations!inner(
            confirmation_code, status,
            created_at, start_date, end_date, nights_count,
            additional_requests
          ),
          eckcm_room_assignments(
            eckcm_rooms(room_number)
          )
        )
      `)
      .eq("eckcm_groups.event_id", eventId)
      .eq("eckcm_people.department_id", departmentId)
      .in("eckcm_groups.eckcm_registrations.status", ["SUBMITTED", "APPROVED", "PAID"]);

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: ParticipantRow[] = data.map((m: any) => {
        const prefs = m.eckcm_groups.preferences;
        const lodgingType =
          m.eckcm_groups.lodging_type ??
          (prefs && typeof prefs === "object" ? prefs.lodgingType ?? null : null);

        // Room assignment may be 0..1 (returned as array by PostgREST)
        const raRaw = m.eckcm_groups.eckcm_room_assignments;
        const assignment = Array.isArray(raRaw) ? raRaw[0] : raRaw ?? null;
        const roomNumber = assignment?.eckcm_rooms?.room_number ?? null;

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
          church_name:
            m.eckcm_people.church_other ||
            m.eckcm_people.eckcm_churches?.name_en ||
            null,
          guardian_name: m.eckcm_people.guardian_name ?? null,
          guardian_phone: m.eckcm_people.guardian_phone ?? null,
          confirmation_code: m.eckcm_groups.eckcm_registrations.confirmation_code,
          registration_status: m.eckcm_groups.eckcm_registrations.status,
          registration_created_at: m.eckcm_groups.eckcm_registrations.created_at,
          registration_start: m.eckcm_groups.eckcm_registrations.start_date,
          registration_end: m.eckcm_groups.eckcm_registrations.end_date,
          nights_count: m.eckcm_groups.eckcm_registrations.nights_count,
          additional_requests:
            m.eckcm_groups.eckcm_registrations.additional_requests ?? null,
          group_role: m.role,
          membership_status: m.status,
          display_group_code: m.eckcm_groups.display_group_code,
          participant_code: m.participant_code,
          lodging_type: lodgingType,
          room_number: roomNumber,
        };
      });
      setParticipants(rows);
    }
    setLoading(false);
  }, [eventId, departmentId]);

  useEffect(() => {
    loadParticipants();
  }, [loadParticipants]);

  const _reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const _reload = () => {
    if (_reloadTimer.current) clearTimeout(_reloadTimer.current);
    _reloadTimer.current = setTimeout(loadParticipants, 500);
  };
  useRealtime(
    { table: "eckcm_registrations", event: "*", filter: `event_id=eq.${eventId}` },
    _reload
  );
  useRealtime({ table: "eckcm_group_memberships", event: "*" }, _reload);
  useRealtime({ table: "eckcm_room_assignments", event: "*" }, _reload);
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
      (p.guardian_name?.toLowerCase().includes(q) ?? false) ||
      (p.room_number?.toLowerCase().includes(q) ?? false) ||
      (p.additional_requests?.toLowerCase().includes(q) ?? false)
    );
  });

  const { sortedData: sorted, sortConfig, requestSort } = useTableSort(filtered);

  // Stats — Total / Male / Female only (Other/N/A intentionally dropped).
  const stats = useMemo(() => {
    const total = filtered.length;
    let male = 0;
    let female = 0;
    let other = 0;
    for (const p of filtered) {
      const g = (p.gender ?? "").toUpperCase();
      if (g === "MALE" || g === "M") male += 1;
      else if (g === "FEMALE" || g === "F") female += 1;
      else other += 1;
    }
    return { total, male, female, other };
  }, [filtered]);

  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const buildExportRows = (): ExportRow[] =>
    sorted.map((p) => ({
      name: `${p.first_name_en} ${p.last_name_en}`,
      nameKo: p.display_name_ko,
      gender: p.gender,
      birthDate: p.birth_date,
      age: p.age_at_event,
      grade: p.is_k12 ? p.grade : null,
      church: p.church_name,
      groupCode: p.display_group_code,
      role: p.group_role,
      status: p.membership_status,
      confirmationCode: p.confirmation_code,
      participantCode: p.participant_code,
      registrationStatus: p.registration_status,
      checkin: p.registration_start,
      checkout: p.registration_end,
      nights: p.nights_count,
      lodging: p.lodging_type
        ? p.lodging_type.replace("LODGING_", "").replace(/_/g, " ")
        : null,
      email: p.email,
      phone: p.phone,
      guardianName: p.guardian_name,
      guardianPhone: p.guardian_phone,
    }));

  const eventLabel = events.find((e) => e.id === eventId);
  const baseFileName = `${departmentName.replace(/\s+/g, "_")}_${
    eventLabel ? `${eventLabel.name_en}_${eventLabel.year}` : "event"
  }`.replace(/[^A-Za-z0-9_\-]/g, "");

  const handleExcel = async () => {
    if (sorted.length === 0) {
      toast.error("No participants to export");
      return;
    }
    setExporting("xlsx");
    try {
      await exportDepartmentToExcel({
        rows: buildExportRows(),
        departmentName,
        eventName: eventLabel ? `${eventLabel.name_en} (${eventLabel.year})` : "",
        stats,
        fileName: `${baseFileName}.xlsx`,
      });
    } catch (err) {
      toast.error(`Excel export failed: ${(err as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  const handlePdf = async () => {
    if (sorted.length === 0) {
      toast.error("No participants to export");
      return;
    }
    setExporting("pdf");
    try {
      await exportDepartmentToPdf({
        rows: buildExportRows(),
        departmentName,
        eventName: eventLabel ? `${eventLabel.name_en} (${eventLabel.year})` : "",
        stats,
        fileName: `${baseFileName}.pdf`,
      });
    } catch (err) {
      toast.error(`PDF export failed: ${(err as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

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

  function formatRegDate(iso: string | null) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  return (
    <div className="space-y-4">
      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total" value={stats.total} icon={Users} />
        <StatCard
          label="Male"
          value={stats.male}
          icon={User}
          accent="text-blue-600"
        />
        <StatCard
          label="Female"
          value={stats.female}
          icon={UserCheck}
          accent="text-pink-600"
        />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
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
          placeholder="Search name, email, phone, church, code, room..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExcel}
            disabled={exporting !== null || sorted.length === 0}
          >
            <FileSpreadsheet className="mr-1 size-4" />
            {exporting === "xlsx" ? "Exporting…" : "Excel"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePdf}
            disabled={exporting !== null || sorted.length === 0}
          >
            <FileText className="mr-1 size-4" />
            {exporting === "pdf" ? "Exporting…" : "PDF"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {departmentName} — {sorted.length} participant(s)
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
                    <SortableTableHead className="whitespace-nowrap" sortKey="first_name_en" sortConfig={sortConfig} onSort={requestSort}>Name</SortableTableHead>
                    <SortableTableHead sortKey="display_name_ko" sortConfig={sortConfig} onSort={requestSort}>Display Name</SortableTableHead>
                    <SortableTableHead sortKey="gender" sortConfig={sortConfig} onSort={requestSort}>Gender</SortableTableHead>
                    <SortableTableHead sortKey="birth_date" sortConfig={sortConfig} onSort={requestSort}>DOB</SortableTableHead>
                    <SortableTableHead sortKey="age_at_event" sortConfig={sortConfig} onSort={requestSort}>Age</SortableTableHead>
                    <SortableTableHead sortKey="is_k12" sortConfig={sortConfig} onSort={requestSort}>K-12</SortableTableHead>
                    <SortableTableHead sortKey="grade" sortConfig={sortConfig} onSort={requestSort}>Grade</SortableTableHead>
                    <SortableTableHead sortKey="church_name" sortConfig={sortConfig} onSort={requestSort}>Church</SortableTableHead>
                    <SortableTableHead sortKey="display_group_code" sortConfig={sortConfig} onSort={requestSort}>Group</SortableTableHead>
                    <SortableTableHead sortKey="group_role" sortConfig={sortConfig} onSort={requestSort}>Role</SortableTableHead>
                    <SortableTableHead sortKey="membership_status" sortConfig={sortConfig} onSort={requestSort}>Status</SortableTableHead>
                    <SortableTableHead sortKey="confirmation_code" sortConfig={sortConfig} onSort={requestSort}>Reg Code</SortableTableHead>
                    <SortableTableHead sortKey="participant_code" sortConfig={sortConfig} onSort={requestSort}>P.Code</SortableTableHead>
                    <SortableTableHead sortKey="registration_status" sortConfig={sortConfig} onSort={requestSort}>Reg Status</SortableTableHead>
                    <SortableTableHead sortKey="registration_created_at" sortConfig={sortConfig} onSort={requestSort}>Registered</SortableTableHead>
                    <SortableTableHead sortKey="registration_start" sortConfig={sortConfig} onSort={requestSort}>Check-in</SortableTableHead>
                    <SortableTableHead sortKey="registration_end" sortConfig={sortConfig} onSort={requestSort}>Check-out</SortableTableHead>
                    <SortableTableHead sortKey="nights_count" sortConfig={sortConfig} onSort={requestSort}>Nights</SortableTableHead>
                    <SortableTableHead sortKey="lodging_type" sortConfig={sortConfig} onSort={requestSort}>Lodging</SortableTableHead>
                    <SortableTableHead sortKey="room_number" sortConfig={sortConfig} onSort={requestSort}>Room</SortableTableHead>
                    <SortableTableHead sortKey="additional_requests" sortConfig={sortConfig} onSort={requestSort}>Request</SortableTableHead>
                    <SortableTableHead sortKey="email" sortConfig={sortConfig} onSort={requestSort}>Email</SortableTableHead>
                    <SortableTableHead sortKey="phone" sortConfig={sortConfig} onSort={requestSort}>Phone</SortableTableHead>
                    <SortableTableHead sortKey="guardian_name" sortConfig={sortConfig} onSort={requestSort}>Guardian</SortableTableHead>
                    <SortableTableHead sortKey="guardian_phone" sortConfig={sortConfig} onSort={requestSort}>Guardian Phone</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((p, i) => (
                    <TableRow key={`${p.person_id}-${i}`}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {p.first_name_en} {p.last_name_en}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{p.display_name_ko ?? "-"}</TableCell>
                      <TableCell>{p.gender}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.birth_date}</TableCell>
                      <TableCell>{p.age_at_event ?? "-"}</TableCell>
                      <TableCell>{p.is_k12 ? "Y" : "-"}</TableCell>
                      <TableCell>{p.grade ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{p.church_name ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{p.display_group_code}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{p.group_role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{p.membership_status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.confirmation_code ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{p.participant_code ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[p.registration_status] ?? "secondary"}>
                          {p.registration_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatRegDate(p.registration_created_at)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatDate(p.registration_start)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatDate(p.registration_end)}</TableCell>
                      <TableCell>{p.nights_count ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatLodging(p.lodging_type)}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{p.room_number ?? "-"}</TableCell>
                      <TableCell
                        className="text-xs max-w-[220px] truncate"
                        title={p.additional_requests ?? ""}
                      >
                        {p.additional_requests ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs">{p.email ?? "-"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{p.phone ?? "-"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{p.guardian_name ?? "-"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{p.guardian_phone ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={25} className="text-center text-muted-foreground py-8">
                        No participants found in this department.
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

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-md bg-muted p-2 ${accent ?? "text-foreground"}`}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold leading-none mt-1">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
