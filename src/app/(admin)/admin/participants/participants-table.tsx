"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useDeferredValue,
  memo,
} from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useRealtime, useChangeDetector } from "@/lib/hooks/use-realtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
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
import { formatCurrency } from "@/lib/utils/formatters";

interface Event {
  id: string;
  name_en: string;
  year: number;
}

interface ParticipantTitleOption {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
}

const NO_TITLE = "__none__";

interface ParticipantRow {
  membership_id: string;
  title_id: string | null;
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
  registration_group_name: string | null;
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

type EnrichedRow = ParticipantRow & { title_name: string | null };

const STATUS_VARIANT: Record<
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
  return formatCurrency(cents);
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

const ParticipantRowItem = memo(function ParticipantRowItem({
  p,
  titleOptions,
  onAssignTitle,
}: {
  p: EnrichedRow;
  titleOptions: ParticipantTitleOption[];
  onAssignTitle: (membershipId: string, value: string) => void;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium whitespace-nowrap">
        {p.first_name_en} {p.last_name_en}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {p.display_name_ko ?? "-"}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <Select
          value={p.title_id ?? NO_TITLE}
          onValueChange={(v) => onAssignTitle(p.membership_id, v)}
        >
          <SelectTrigger className="h-7 w-[150px] text-xs">
            <SelectValue placeholder="— Title —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TITLE}>
              <span className="text-muted-foreground">— None —</span>
            </SelectItem>
            {titleOptions.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: t.color ?? "#94a3b8" }}
                  />
                  {t.name}
                  {!t.is_active && " (inactive)"}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>{p.gender}</TableCell>
      <TableCell className="whitespace-nowrap">{p.birth_date}</TableCell>
      <TableCell>{p.age_at_event ?? "-"}</TableCell>
      <TableCell>{p.is_k12 ? "Y" : "-"}</TableCell>
      <TableCell>{p.grade ?? "-"}</TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        {p.church_name ?? "-"}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        {p.department_name ?? "-"}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        {p.registration_group_name ?? "-"}
      </TableCell>
      <TableCell className="font-mono text-xs">{p.display_group_code}</TableCell>
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
        <Badge variant={STATUS_VARIANT[p.registration_status] ?? "secondary"}>
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
      <TableCell className="text-xs">{p.room_assign_status ?? "-"}</TableCell>
      <TableCell>{p.key_count ?? "-"}</TableCell>
      <TableCell className="whitespace-nowrap font-mono text-xs">
        {formatMoney(p.total_amount_cents)}
      </TableCell>
      <TableCell className="text-xs">{p.email ?? "-"}</TableCell>
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
  );
});

export function ParticipantsTable({
  events,
  titles,
}: {
  events: Event[];
  titles: ParticipantTitleOption[];
}) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [search, setSearch] = useState("");
  // Keep the input responsive: typing updates `search` immediately, but the
  // expensive filter/sort/render runs against the deferred value so keystrokes
  // never block on re-rendering the (potentially huge) table.
  const deferredSearch = useDeferredValue(search);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [regGroupFilter, setRegGroupFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");

  const titleById = useMemo(
    () => new Map(titles.map((t) => [t.id, t])),
    [titles]
  );

  const loadParticipants = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("eckcm_group_memberships")
      .select(`
        id,
        person_id,
        role,
        status,
        participant_code,
        title_id,
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
            total_amount_cents, created_at,
            eckcm_registration_groups(name_en)
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
          membership_id: m.id,
          title_id: m.title_id ?? null,
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
          registration_group_name:
            m.eckcm_groups.eckcm_registrations.eckcm_registration_groups
              ?.name_en ?? null,
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

  const activeTitles = useMemo(() => titles.filter((t) => t.is_active), [titles]);

  // Options for a row's dropdown: active titles, plus the currently-assigned one
  // if it has since been deactivated (so its label still shows).
  // Stable identity so memoized rows don't re-render on every parent render.
  const titleOptionsFor = useCallback(
    (currentId: string | null) => {
      if (currentId && !activeTitles.some((t) => t.id === currentId)) {
        const cur = titleById.get(currentId);
        if (cur) return [cur, ...activeTitles];
      }
      return activeTitles;
    },
    [activeTitles, titleById]
  );

  const assignTitle = useCallback(async (membershipId: string, value: string) => {
    const title_id = value === NO_TITLE ? null : value;
    let snapshot: ParticipantRow[] = [];
    // Optimistic update (capture the pre-update snapshot for revert).
    setParticipants((rows) => {
      snapshot = rows;
      return rows.map((r) =>
        r.membership_id === membershipId ? { ...r, title_id } : r
      );
    });
    try {
      const res = await fetch(
        `/api/admin/participants/${membershipId}/title`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title_id }),
        }
      );
      if (!res.ok) throw new Error("request failed");
      toast.success("Title updated");
    } catch {
      setParticipants(snapshot); // revert
      toast.error("Failed to update title");
    }
  }, []);

  const enriched = useMemo<EnrichedRow[]>(
    () =>
      participants.map((p) => ({
        ...p,
        title_name: p.title_id ? titleById.get(p.title_id)?.name ?? null : null,
      })),
    [participants, titleById]
  );

  // Distinct filter options derived from currently loaded rows.
  const regGroupOptions = useMemo(
    () =>
      Array.from(
        new Set(
          participants
            .map((p) => p.registration_group_name)
            .filter((v): v is string => !!v)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [participants]
  );
  const departmentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          participants
            .map((p) => p.department_name)
            .filter((v): v is string => !!v)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [participants]
  );

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return enriched.filter((p) => {
      if (
        regGroupFilter !== "ALL" &&
        p.registration_group_name !== regGroupFilter
      )
        return false;
      if (departmentFilter !== "ALL" && p.department_name !== departmentFilter)
        return false;
      if (!q) return true;
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
        (p.guardian_name?.toLowerCase().includes(q) ?? false) ||
        (p.title_name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [enriched, deferredSearch, regGroupFilter, departmentFilter]);

  const { sortedData: sorted, sortConfig, requestSort } = useTableSort(filtered);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Participants</h1>

      <div className="flex flex-wrap items-center gap-3">
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

        <Select value={regGroupFilter} onValueChange={setRegGroupFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Reg. Groups</SelectItem>
            {regGroupOptions.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Departments</SelectItem>
            {departmentOptions.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SearchInput
          placeholder="Search name, email, phone, church, code..."
          value={search}
          onValueChange={setSearch}
          containerClassName="max-w-sm"
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
                    <SortableTableHead sortKey="title_name" sortConfig={sortConfig} onSort={requestSort}>Title</SortableTableHead>
                    <SortableTableHead sortKey="gender" sortConfig={sortConfig} onSort={requestSort}>Gender</SortableTableHead>
                    <SortableTableHead sortKey="date_of_birth" sortConfig={sortConfig} onSort={requestSort}>DOB</SortableTableHead>
                    <SortableTableHead sortKey="age_at_event" sortConfig={sortConfig} onSort={requestSort}>Age</SortableTableHead>
                    <SortableTableHead sortKey="is_k12" sortConfig={sortConfig} onSort={requestSort}>K-12</SortableTableHead>
                    <SortableTableHead sortKey="grade" sortConfig={sortConfig} onSort={requestSort}>Grade</SortableTableHead>
                    <SortableTableHead sortKey="church_name" sortConfig={sortConfig} onSort={requestSort}>Church</SortableTableHead>
                    <SortableTableHead sortKey="department_name" sortConfig={sortConfig} onSort={requestSort}>Dept</SortableTableHead>
                    <SortableTableHead sortKey="registration_group_name" sortConfig={sortConfig} onSort={requestSort}>Reg. Group</SortableTableHead>
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
                  {sorted.map((p) => (
                    <ParticipantRowItem
                      key={p.membership_id}
                      p={p}
                      titleOptions={titleOptionsFor(p.title_id)}
                      onAssignTitle={assignTitle}
                    />
                  ))}
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={29}
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
