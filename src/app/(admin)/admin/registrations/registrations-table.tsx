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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Eye, Users, RefreshCw } from "lucide-react";

interface Event {
  id: string;
  name_en: string;
  year: number;
}

interface RegistrationRow {
  id: string;
  confirmation_code: string;
  status: string;
  start_date: string;
  end_date: string;
  nights_count: number;
  total_amount_cents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  group_count: number;
  people_count: number;
  registrant_name: string;
  registrant_name_ko: string | null;
  registrant_email: string | null;
  registrant_phone: string | null;
  registrant_church: string | null;
  registrant_department: string | null;
  registration_group_name: string | null;
  invoice_number: string | null;
  payment_status: string | null;
  payment_method: string | null;
  paid_at: string | null;
  // On-site check-in/out (Yes/No)
  checked_in: boolean;
  checked_out: boolean;
  // Room info
  room_numbers: string[];
}

interface PersonDetail {
  first_name_en: string;
  last_name_en: string;
  display_name_ko: string | null;
  gender: string;
  age_at_event: number | null;
  is_k12: boolean;
  grade: string | null;
  church_name: string | null;
  department_name: string | null;
  group_code: string;
  role: string;
  participant_code: string | null;
}

const STATUS_OPTIONS = ["ALL", "PAID", "SUBMITTED", "DRAFT", "CANCELLED", "REFUNDED"];

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PAID: "default",
  SUBMITTED: "outline",
  DRAFT: "secondary",
  CANCELLED: "destructive",
  REFUNDED: "destructive",
};

const paymentStatusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  SUCCEEDED: "default",
  PENDING: "outline",
  FAILED: "destructive",
  REFUNDED: "destructive",
  PARTIALLY_REFUNDED: "destructive",
};

export function RegistrationsTable({ events }: { events: Event[] }) {
  const [mounted, setMounted] = useState(false);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => setMounted(true), []);

  // Detail dialog
  const [detailReg, setDetailReg] = useState<RegistrationRow | null>(null);
  const [detailPeople, setDetailPeople] = useState<PersonDetail[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Status update
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadRegistrations = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const supabase = createClient();

    // Main registration query
    const { data } = await supabase
      .from("eckcm_registrations")
      .select(`
        id,
        confirmation_code,
        status,
        start_date,
        end_date,
        nights_count,
        total_amount_cents,
        notes,
        created_at,
        updated_at,
        eckcm_registration_groups(name_en),
        eckcm_invoices(
          invoice_number,
          status,
          paid_at,
          eckcm_payments(payment_method, status)
        ),
        eckcm_groups(
          id,
          display_group_code,
          eckcm_room_assignments(
            eckcm_rooms(room_number)
          ),
          eckcm_group_memberships(
            person_id,
            role,
            eckcm_people!inner(
              first_name_en, last_name_en, display_name_ko,
              email, phone,
              eckcm_churches(name_en),
              eckcm_departments(name_en)
            )
          )
        )
      `)
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    // Fetch all MAIN check-ins for this event (arrival check-in)
    const { data: checkins } = await supabase
      .from("eckcm_checkins")
      .select("person_id")
      .eq("event_id", eventId)
      .eq("checkin_type", "MAIN");

    const checkinSet = new Set(
      (checkins ?? []).map((c) => c.person_id)
    );

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: RegistrationRow[] = data.map((r: any) => {
        const groups = r.eckcm_groups ?? [];
        let peopleCount = 0;
        let registrantName = "Unknown";
        let registrantNameKo: string | null = null;
        let registrantEmail: string | null = null;
        let registrantPhone: string | null = null;
        let registrantChurch: string | null = null;
        let registrantDept: string | null = null;
        let repPersonId: string | null = null;
        const roomNumbers: string[] = [];

        for (const g of groups) {
          // Room assignments
          const roomAssignments = g.eckcm_room_assignments ?? [];
          for (const ra of roomAssignments) {
            if (ra.eckcm_rooms?.room_number) {
              roomNumbers.push(ra.eckcm_rooms.room_number);
            }
          }

          const members = g.eckcm_group_memberships ?? [];
          peopleCount += members.length;
          for (const m of members) {
            if (m.role === "REPRESENTATIVE" && registrantName === "Unknown") {
              repPersonId = m.person_id;
              registrantName = `${m.eckcm_people.first_name_en} ${m.eckcm_people.last_name_en}`;
              registrantNameKo = m.eckcm_people.display_name_ko;
              registrantEmail = m.eckcm_people.email;
              registrantPhone = m.eckcm_people.phone;
              registrantChurch = m.eckcm_people.eckcm_churches?.name_en ?? null;
              registrantDept = m.eckcm_people.eckcm_departments?.name_en ?? null;
            }
          }
        }

        // Check if representative has checked in on-site
        const checkedIn = repPersonId ? checkinSet.has(repPersonId) : false;

        // Invoice & payment info
        const invoices = r.eckcm_invoices ?? [];
        const invoice = invoices[0];
        let paymentMethod: string | null = null;
        let paymentStatus: string | null = null;
        if (invoice) {
          const payments = invoice.eckcm_payments ?? [];
          const successPayment = payments.find((p: any) => p.status === "SUCCEEDED") ?? payments[0];
          if (successPayment) {
            paymentMethod = successPayment.payment_method;
            paymentStatus = successPayment.status;
          }
        }

        return {
          id: r.id,
          confirmation_code: r.confirmation_code,
          status: r.status,
          start_date: r.start_date,
          end_date: r.end_date,
          nights_count: r.nights_count,
          total_amount_cents: r.total_amount_cents,
          notes: r.notes,
          created_at: r.created_at,
          updated_at: r.updated_at,
          group_count: groups.length,
          people_count: peopleCount,
          registrant_name: registrantName,
          registrant_name_ko: registrantNameKo,
          registrant_email: registrantEmail,
          registrant_phone: registrantPhone,
          registrant_church: registrantChurch,
          registrant_department: registrantDept,
          registration_group_name: r.eckcm_registration_groups?.name_en ?? null,
          invoice_number: invoice?.invoice_number ?? null,
          payment_status: paymentStatus ?? invoice?.status ?? null,
          payment_method: paymentMethod,
          paid_at: invoice?.paid_at ?? null,
          checked_in: checkedIn,
          checked_out: false, // Not tracked yet
          room_numbers: roomNumbers,
        };
      });
      setRegistrations(rows);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    loadRegistrations();
  }, [loadRegistrations]);

  // ─── Detail dialog ─────────────────────────────────────────────

  const openDetail = async (reg: RegistrationRow) => {
    setDetailReg(reg);
    setLoadingDetail(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("eckcm_group_memberships")
      .select(`
        role,
        participant_code,
        eckcm_people!inner(
          first_name_en, last_name_en, display_name_ko,
          gender, age_at_event, is_k12, grade,
          eckcm_churches(name_en),
          eckcm_departments(name_en)
        ),
        eckcm_groups!inner(display_group_code, registration_id)
      `)
      .eq("eckcm_groups.registration_id", reg.id);

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const people: PersonDetail[] = data.map((m: any) => ({
        first_name_en: m.eckcm_people.first_name_en,
        last_name_en: m.eckcm_people.last_name_en,
        display_name_ko: m.eckcm_people.display_name_ko,
        gender: m.eckcm_people.gender,
        age_at_event: m.eckcm_people.age_at_event,
        is_k12: m.eckcm_people.is_k12 ?? false,
        grade: m.eckcm_people.grade,
        church_name: m.eckcm_people.eckcm_churches?.name_en ?? null,
        department_name: m.eckcm_people.eckcm_departments?.name_en ?? null,
        group_code: m.eckcm_groups.display_group_code,
        role: m.role,
        participant_code: m.participant_code,
      }));
      setDetailPeople(people);
    }
    setLoadingDetail(false);
  };

  // ─── Status update ─────────────────────────────────────────────

  const updateStatus = async (regId: string, newStatus: string) => {
    setUpdatingId(regId);
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_registrations")
      .update({ status: newStatus })
      .eq("id", regId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Status updated to ${newStatus}`);
      loadRegistrations();
      if (detailReg?.id === regId) {
        setDetailReg({ ...detailReg, status: newStatus });
      }
    }
    setUpdatingId(null);
  };

  // ─── Filter ────────────────────────────────────────────────────

  const filtered = registrations.filter((r) => {
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.confirmation_code.toLowerCase().includes(q) ||
      r.registrant_name.toLowerCase().includes(q) ||
      (r.registrant_name_ko?.toLowerCase().includes(q) ?? false) ||
      (r.registrant_email?.toLowerCase().includes(q) ?? false) ||
      (r.registrant_phone?.includes(q) ?? false) ||
      (r.registrant_church?.toLowerCase().includes(q) ?? false) ||
      (r.invoice_number?.toLowerCase().includes(q) ?? false) ||
      r.room_numbers.some((rn) => rn.toLowerCase().includes(q)) ||
      (r.notes?.toLowerCase().includes(q) ?? false)
    );
  });

  // ─── Helpers ───────────────────────────────────────────────────

  function formatMoney(cents: number) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function formatTimestamp(ts: string) {
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // ─── Summary stats ─────────────────────────────────────────────

  const totalPaid = registrations.filter((r) => r.status === "PAID").length;
  const totalAmount = registrations
    .filter((r) => r.status === "PAID")
    .reduce((sum, r) => sum + r.total_amount_cents, 0);
  const totalPeople = registrations
    .filter((r) => r.status === "PAID")
    .reduce((sum, r) => sum + r.people_count, 0);

  if (!mounted) return null;

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

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "ALL" ? "All Statuses" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Search code, name, room..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[250px]"
        />

        <Button variant="ghost" size="icon" onClick={loadRegistrations}>
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {/* Summary */}
      <div className="flex gap-6 text-sm text-muted-foreground">
        <span>{registrations.length} total registration(s)</span>
        <span>{totalPaid} paid</span>
        <span>{totalPeople} people (paid)</span>
        <span>{formatMoney(totalAmount)} collected</span>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {filtered.length} registration(s)
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
                    {/* User-specified order first */}
                    <TableHead className="whitespace-nowrap">Actions</TableHead>
                    <TableHead className="whitespace-nowrap">Code</TableHead>
                    <TableHead className="whitespace-nowrap">Name</TableHead>
                    <TableHead className="whitespace-nowrap">Reg Status</TableHead>
                    <TableHead className="whitespace-nowrap">Pay Status</TableHead>
                    <TableHead className="whitespace-nowrap">C-IN</TableHead>
                    <TableHead className="whitespace-nowrap">C-OUT</TableHead>
                    <TableHead className="whitespace-nowrap">Room</TableHead>
                    <TableHead className="whitespace-nowrap">Pay Method</TableHead>
                    <TableHead className="whitespace-nowrap">People</TableHead>
                    <TableHead className="whitespace-nowrap">Invoice</TableHead>
                    {/* Remaining columns by importance */}
                    <TableHead className="whitespace-nowrap">Amount</TableHead>
                    <TableHead className="whitespace-nowrap">Email</TableHead>
                    <TableHead className="whitespace-nowrap">Phone</TableHead>
                    <TableHead className="whitespace-nowrap">Church</TableHead>
                    <TableHead className="whitespace-nowrap">Department</TableHead>
                    <TableHead className="whitespace-nowrap">Reg. Group</TableHead>
                    <TableHead className="whitespace-nowrap">Check-in</TableHead>
                    <TableHead className="whitespace-nowrap">Check-out</TableHead>
                    <TableHead className="whitespace-nowrap">Nights</TableHead>
                    <TableHead className="whitespace-nowrap">Paid At</TableHead>
                    <TableHead className="whitespace-nowrap">Notes</TableHead>
                    <TableHead className="whitespace-nowrap">Registered</TableHead>
                    <TableHead className="whitespace-nowrap">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      {/* Actions */}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => openDetail(r)}
                        >
                          <Eye className="mr-1 size-3" />
                          View
                        </Button>
                      </TableCell>
                      {/* Code */}
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {r.confirmation_code}
                      </TableCell>
                      {/* Name */}
                      <TableCell className="whitespace-nowrap">
                        <div className="font-medium text-sm">{r.registrant_name}</div>
                        {r.registrant_name_ko && (
                          <div className="text-xs text-muted-foreground">
                            {r.registrant_name_ko}
                          </div>
                        )}
                      </TableCell>
                      {/* Reg Status */}
                      <TableCell>
                        <Badge variant={statusVariant[r.status] ?? "secondary"}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      {/* Pay Status */}
                      <TableCell>
                        {r.payment_status ? (
                          <Badge
                            variant={paymentStatusVariant[r.payment_status] ?? "secondary"}
                            className="text-xs"
                          >
                            {r.payment_status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      {/* C-IN */}
                      <TableCell className="text-center">
                        <Badge variant={r.checked_in ? "default" : "secondary"} className="text-xs">
                          {r.checked_in ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      {/* C-OUT */}
                      <TableCell className="text-center">
                        <Badge variant={r.checked_out ? "default" : "secondary"} className="text-xs">
                          {r.checked_out ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      {/* Room */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.room_numbers.length > 0 ? r.room_numbers.join(", ") : "-"}
                      </TableCell>
                      {/* Pay Method */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.payment_method?.replace(/_/g, " ") ?? "-"}
                      </TableCell>
                      {/* People */}
                      <TableCell>
                        <span className="flex items-center gap-1 text-sm">
                          <Users className="size-3" />
                          {r.people_count}
                        </span>
                      </TableCell>
                      {/* Invoice */}
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {r.invoice_number ?? "-"}
                      </TableCell>
                      {/* Amount */}
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {formatMoney(r.total_amount_cents)}
                      </TableCell>
                      {/* Email */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.registrant_email ?? "-"}
                      </TableCell>
                      {/* Phone */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.registrant_phone ?? "-"}
                      </TableCell>
                      {/* Church */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.registrant_church ?? "-"}
                      </TableCell>
                      {/* Department */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.registrant_department ?? "-"}
                      </TableCell>
                      {/* Reg. Group */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.registration_group_name ?? "-"}
                      </TableCell>
                      {/* Check-in date */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.start_date}
                      </TableCell>
                      {/* Check-out date */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.end_date}
                      </TableCell>
                      {/* Nights */}
                      <TableCell>{r.nights_count}</TableCell>
                      {/* Paid At */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.paid_at ? formatTimestamp(r.paid_at) : "-"}
                      </TableCell>
                      {/* Notes */}
                      <TableCell className="text-xs max-w-[200px] truncate" title={r.notes ?? ""}>
                        {r.notes ?? "-"}
                      </TableCell>
                      {/* Registered */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatTimestamp(r.created_at)}
                      </TableCell>
                      {/* Updated */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatTimestamp(r.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={24}
                        className="text-center text-muted-foreground py-8"
                      >
                        No registrations found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog
        open={!!detailReg}
        onOpenChange={(open) => !open && setDetailReg(null)}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Registration {detailReg?.confirmation_code}
            </DialogTitle>
          </DialogHeader>

          {detailReg && (
            <div className="space-y-4">
              {/* Registration info */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Registrant:</span>{" "}
                  <span className="font-medium">{detailReg.registrant_name}</span>
                  {detailReg.registrant_name_ko && (
                    <span className="ml-1 text-muted-foreground">
                      ({detailReg.registrant_name_ko})
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Reg Status:</span>{" "}
                  <Badge variant={statusVariant[detailReg.status] ?? "secondary"}>
                    {detailReg.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Pay Status:</span>{" "}
                  {detailReg.payment_status ? (
                    <Badge
                      variant={paymentStatusVariant[detailReg.payment_status] ?? "secondary"}
                      className="text-xs"
                    >
                      {detailReg.payment_status}
                    </Badge>
                  ) : (
                    "-"
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">C-IN:</span>{" "}
                  {detailReg.checked_in ? "Yes" : "No"}
                </div>
                <div>
                  <span className="text-muted-foreground">C-OUT:</span>{" "}
                  {detailReg.checked_out ? "Yes" : "No"}
                </div>
                <div>
                  <span className="text-muted-foreground">Room:</span>{" "}
                  {detailReg.room_numbers.length > 0
                    ? detailReg.room_numbers.join(", ")
                    : "-"}
                </div>
                <div>
                  <span className="text-muted-foreground">Pay Method:</span>{" "}
                  {detailReg.payment_method?.replace(/_/g, " ") ?? "-"}
                </div>
                <div>
                  <span className="text-muted-foreground">People:</span>{" "}
                  {detailReg.people_count}
                </div>
                <div>
                  <span className="text-muted-foreground">Invoice:</span>{" "}
                  <span className="font-mono">
                    {detailReg.invoice_number ?? "-"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Amount:</span>{" "}
                  <span className="font-mono">
                    {formatMoney(detailReg.total_amount_cents)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Email:</span>{" "}
                  {detailReg.registrant_email ?? "-"}
                </div>
                <div>
                  <span className="text-muted-foreground">Phone:</span>{" "}
                  {detailReg.registrant_phone ?? "-"}
                </div>
                <div>
                  <span className="text-muted-foreground">Church:</span>{" "}
                  {detailReg.registrant_church ?? "-"}
                </div>
                <div>
                  <span className="text-muted-foreground">Department:</span>{" "}
                  {detailReg.registrant_department ?? "-"}
                </div>
                <div>
                  <span className="text-muted-foreground">Reg. Group:</span>{" "}
                  {detailReg.registration_group_name ?? "-"}
                </div>
                <div>
                  <span className="text-muted-foreground">Check-in:</span>{" "}
                  {detailReg.start_date}
                </div>
                <div>
                  <span className="text-muted-foreground">Check-out:</span>{" "}
                  {detailReg.end_date}
                </div>
                <div>
                  <span className="text-muted-foreground">Nights:</span>{" "}
                  {detailReg.nights_count}
                </div>
                <div>
                  <span className="text-muted-foreground">Paid At:</span>{" "}
                  {detailReg.paid_at ? formatTimestamp(detailReg.paid_at) : "-"}
                </div>
                <div>
                  <span className="text-muted-foreground">Groups:</span>{" "}
                  {detailReg.group_count}
                </div>
                <div>
                  <span className="text-muted-foreground">Registered:</span>{" "}
                  {formatTimestamp(detailReg.created_at)}
                </div>
                <div>
                  <span className="text-muted-foreground">Updated:</span>{" "}
                  {formatTimestamp(detailReg.updated_at)}
                </div>
                {detailReg.notes && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Notes:</span>{" "}
                    {detailReg.notes}
                  </div>
                )}
              </div>

              {/* Status change */}
              <div className="flex items-center gap-2 border-t pt-3">
                <span className="text-sm text-muted-foreground">Change status:</span>
                {["DRAFT", "SUBMITTED", "PAID", "CANCELLED", "REFUNDED"]
                  .filter((s) => s !== detailReg.status)
                  .map((s) => (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={updatingId === detailReg.id}
                      onClick={() => updateStatus(detailReg.id, s)}
                    >
                      {s}
                    </Button>
                  ))}
              </div>

              {/* People list */}
              <div className="border-t pt-3">
                <h3 className="font-medium text-sm mb-2">Participants</h3>
                {loadingDetail ? (
                  <p className="text-center text-muted-foreground py-4">
                    Loading...
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Korean</TableHead>
                        <TableHead>Gender</TableHead>
                        <TableHead>Age</TableHead>
                        <TableHead>K-12</TableHead>
                        <TableHead>Church</TableHead>
                        <TableHead>Dept</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>P.Code</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailPeople.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="whitespace-nowrap font-medium text-sm">
                            {p.first_name_en} {p.last_name_en}
                          </TableCell>
                          <TableCell className="text-sm">
                            {p.display_name_ko ?? "-"}
                          </TableCell>
                          <TableCell className="text-xs">{p.gender}</TableCell>
                          <TableCell>{p.age_at_event ?? "-"}</TableCell>
                          <TableCell>{p.is_k12 ? "Y" : "-"}</TableCell>
                          <TableCell className="text-xs">
                            {p.church_name ?? "-"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {p.department_name ?? "-"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {p.group_code}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {p.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {p.participant_code ?? "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {detailPeople.length === 0 && !loadingDetail && (
                        <TableRow>
                          <TableCell
                            colSpan={10}
                            className="text-center text-muted-foreground py-4"
                          >
                            No participants found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
