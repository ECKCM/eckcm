"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
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
import { ShieldCheck, Download, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { GuardianConsentDetailSheet } from "./guardian-consent-detail-sheet";
import { useTableSort } from "@/lib/hooks/use-table-sort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";

interface Event {
  id: string;
  name_en: string;
  year: number;
}

export interface GuardianConsentRow {
  person_id: string;
  first_name_en: string;
  last_name_en: string;
  display_name_ko: string | null;
  gender: string;
  birth_date: string | null;
  age_at_event: number | null;
  is_k12: boolean;
  grade: number | null;
  guardian_name: string;
  guardian_phone: string | null;
  guardian_phone_country: string | null;
  guardian_signature: string | null;
  confirmation_code: string | null;
  registration_status: string;
  display_group_code: string;
  group_role: string;
  church_name: string | null;
  registration_created_at: string | null;
}

export function GuardianConsentsTable({ events }: { events: Event[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [signatureFilter, setSignatureFilter] = useState("ALL");
  const [consents, setConsents] = useState<GuardianConsentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailRow, setDetailRow] = useState<GuardianConsentRow | null>(null);

  const loadConsents = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("eckcm_group_memberships")
      .select(`
        person_id,
        role,
        eckcm_people!inner(
          first_name_en, last_name_en, display_name_ko,
          gender, birth_date, age_at_event, is_k12, grade,
          guardian_name, guardian_phone, guardian_phone_country,
          guardian_signature, church_other,
          eckcm_churches(name_en)
        ),
        eckcm_groups!inner(
          display_group_code,
          event_id,
          eckcm_registrations!inner(
            confirmation_code, status, created_at
          )
        )
      `)
      .eq("eckcm_groups.event_id", eventId)
      .not("eckcm_people.guardian_name", "is", null)
      .in("eckcm_groups.eckcm_registrations.status", ["SUBMITTED", "APPROVED", "PAID"]);

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: GuardianConsentRow[] = data.map((m: any) => ({
        person_id: m.person_id,
        first_name_en: m.eckcm_people.first_name_en,
        last_name_en: m.eckcm_people.last_name_en,
        display_name_ko: m.eckcm_people.display_name_ko,
        gender: m.eckcm_people.gender,
        birth_date: m.eckcm_people.birth_date,
        age_at_event: m.eckcm_people.age_at_event,
        is_k12: m.eckcm_people.is_k12 ?? false,
        grade: m.eckcm_people.grade,
        guardian_name: m.eckcm_people.guardian_name,
        guardian_phone: m.eckcm_people.guardian_phone,
        guardian_phone_country: m.eckcm_people.guardian_phone_country,
        guardian_signature: m.eckcm_people.guardian_signature,
        confirmation_code: m.eckcm_groups.eckcm_registrations.confirmation_code,
        registration_status: m.eckcm_groups.eckcm_registrations.status,
        display_group_code: m.eckcm_groups.display_group_code,
        group_role: m.role,
        church_name:
          m.eckcm_people.church_other ||
          m.eckcm_people.eckcm_churches?.name_en ||
          null,
        registration_created_at: m.eckcm_groups.eckcm_registrations.created_at,
      }));
      setConsents(rows);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    loadConsents();
  }, [loadConsents]);

  const filtered = consents.filter((c) => {
    if (signatureFilter === "SIGNED" && !c.guardian_signature) return false;
    if (signatureFilter === "UNSIGNED" && c.guardian_signature) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.first_name_en.toLowerCase().includes(q) ||
      c.last_name_en.toLowerCase().includes(q) ||
      (c.display_name_ko?.toLowerCase().includes(q) ?? false) ||
      c.guardian_name.toLowerCase().includes(q) ||
      (c.guardian_phone?.includes(q) ?? false) ||
      (c.confirmation_code?.toLowerCase().includes(q) ?? false) ||
      (c.church_name?.toLowerCase().includes(q) ?? false)
    );
  });

  const { sortedData: sorted, sortConfig, requestSort } = useTableSort(filtered);

  const totalSigned = consents.filter((c) => c.guardian_signature).length;
  const totalUnsigned = consents.filter((c) => !c.guardian_signature).length;

  const exportCsv = () => {
    const headers = [
      "Participant Name",
      "Korean Name",
      "Gender",
      "DOB",
      "Age",
      "K-12",
      "Grade",
      "Guardian Name",
      "Guardian Phone",
      "Signature",
      "Reg Code",
      "Reg Status",
      "Group",
      "Role",
      "Church",
      "Registered",
    ];
    const rows = sorted.map((c) => [
      `${c.first_name_en} ${c.last_name_en}`,
      c.display_name_ko ?? "",
      c.gender,
      c.birth_date ?? "",
      c.age_at_event?.toString() ?? "",
      c.is_k12 ? "Y" : "N",
      c.grade?.toString() ?? "",
      c.guardian_name,
      c.guardian_phone ?? "",
      c.guardian_signature ? "Yes" : "No",
      c.confirmation_code ?? "",
      c.registration_status,
      c.display_group_code,
      c.group_role,
      c.church_name ?? "",
      c.registration_created_at
        ? new Date(c.registration_created_at).toLocaleDateString()
        : "",
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `guardian-consents-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  function formatTimestamp(ts: string | null) {
    if (!ts) return "-";
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    PAID: "default",
    APPROVED: "default",
    SUBMITTED: "outline",
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
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

        <Select value={signatureFilter} onValueChange={setSignatureFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="SIGNED">Signed</SelectItem>
            <SelectItem value="UNSIGNED">Unsigned</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Search name, guardian, phone, code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[250px]"
        />

        <Button variant="ghost" size="icon" onClick={loadConsents}>
          <RefreshCw className="size-4" />
        </Button>

        <Button variant="outline" size="sm" onClick={exportCsv} disabled={sorted.length === 0}>
          <Download className="size-4 mr-1" />
          CSV
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          icon={<ShieldCheck className="size-4 text-muted-foreground" />}
          label="Total Consents"
          value={consents.length}
        />
        <SummaryCard
          icon={<CheckCircle2 className="size-4 text-green-600" />}
          label="Signed"
          value={totalSigned}
        />
        <SummaryCard
          icon={<XCircle className="size-4 text-amber-500" />}
          label="Unsigned"
          value={totalUnsigned}
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {sorted.length} consent(s)
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
                    <SortableTableHead className="whitespace-nowrap" sortKey="first_name_en" sortConfig={sortConfig} onSort={requestSort}>Participant</SortableTableHead>
                    <SortableTableHead sortKey="display_name_ko" sortConfig={sortConfig} onSort={requestSort}>Korean</SortableTableHead>
                    <SortableTableHead sortKey="age_at_event" sortConfig={sortConfig} onSort={requestSort}>Age</SortableTableHead>
                    <SortableTableHead sortKey="is_k12" sortConfig={sortConfig} onSort={requestSort}>K-12</SortableTableHead>
                    <SortableTableHead className="whitespace-nowrap" sortKey="guardian_name" sortConfig={sortConfig} onSort={requestSort}>Guardian Name</SortableTableHead>
                    <SortableTableHead className="whitespace-nowrap" sortKey="guardian_phone" sortConfig={sortConfig} onSort={requestSort}>Guardian Phone</SortableTableHead>
                    <SortableTableHead className="text-center" sortKey="guardian_signature" sortConfig={sortConfig} onSort={requestSort}>Signature</SortableTableHead>
                    <SortableTableHead sortKey="confirmation_code" sortConfig={sortConfig} onSort={requestSort}>Reg Code</SortableTableHead>
                    <SortableTableHead sortKey="registration_status" sortConfig={sortConfig} onSort={requestSort}>Status</SortableTableHead>
                    <SortableTableHead sortKey="display_group_code" sortConfig={sortConfig} onSort={requestSort}>Group</SortableTableHead>
                    <SortableTableHead sortKey="church_name" sortConfig={sortConfig} onSort={requestSort}>Church</SortableTableHead>
                    <SortableTableHead className="whitespace-nowrap" sortKey="created_at" sortConfig={sortConfig} onSort={requestSort}>Registered</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((c, i) => (
                    <TableRow
                      key={`${c.person_id}-${i}`}
                      className="cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors"
                      onClick={() => setDetailRow(c)}
                    >
                      <TableCell className="font-medium whitespace-nowrap">
                        {c.first_name_en} {c.last_name_en}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {c.display_name_ko ?? "-"}
                      </TableCell>
                      <TableCell>{c.age_at_event ?? "-"}</TableCell>
                      <TableCell>{c.is_k12 ? "Y" : "-"}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">
                        {c.guardian_name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {c.guardian_phone ?? "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {c.guardian_signature ? (
                          <Badge variant="default" className="text-xs">
                            <CheckCircle2 className="size-3 mr-1" />
                            Signed
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <XCircle className="size-3 mr-1" />
                            No
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.confirmation_code ?? "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[c.registration_status] ?? "secondary"} className="text-xs">
                          {c.registration_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.display_group_code}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {c.church_name ?? "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatTimestamp(c.registration_created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                        No guardian consents found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <GuardianConsentDetailSheet
        consent={detailRow}
        onClose={() => setDetailRow(null)}
      />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}
