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
import { toast } from "sonner";
import { Users, RefreshCw, ExternalLink, DollarSign, UserCheck, ShieldCheck } from "lucide-react";

import {
  type Event,
  type RegistrationRow,
  STATUS_OPTIONS,
  statusVariant,
  paymentStatusVariant,
  formatMoney,
  formatTimestamp,
  extractSeqNumber,
} from "./registrations-types";
import { RegistrationDetailSheet } from "./registration-detail-sheet";
import { RegistrationActions } from "./registration-actions";
import { useRegistrationLock } from "@/lib/hooks/use-registration-lock";

interface RegistrationsTableProps {
  events: Event[];
  currentUserId: string;
  currentUserName: string;
}

export function RegistrationsTable({ events, currentUserId, currentUserName }: RegistrationsTableProps) {
  const [mounted, setMounted] = useState(false);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [stripeAccountId, setStripeAccountId] = useState("");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    fetch("/api/admin/stripe-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.stripe_account_id) setStripeAccountId(data.stripe_account_id);
      })
      .catch(() => {});
  }, []);

  // Pessimistic locking
  const { acquire, release, isLockedByOther } = useRegistrationLock(currentUserId, currentUserName);

  // Detail sheet
  const [detailReg, setDetailReg] = useState<RegistrationRow | null>(null);

  const openDetail = (reg: RegistrationRow) => {
    const lock = isLockedByOther(reg.id);
    if (lock) {
      toast.error(`This registration is being viewed by ${lock.userName}`);
      return;
    }
    setDetailReg(reg);
    acquire(reg.id);
  };

  const closeDetail = () => {
    setDetailReg(null);
    release();
  };

  // Status update
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadRegistrations = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("eckcm_registrations")
      .select(`
        id,
        confirmation_code,
        status,
        registration_type,
        start_date,
        end_date,
        nights_count,
        total_amount_cents,
        notes,
        additional_requests,
        created_at,
        updated_at,
        eckcm_registration_groups(name_en),
        eckcm_invoices(
          invoice_number,
          status,
          paid_at,
          eckcm_payments(payment_method, status, stripe_payment_intent_id)
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
              email, phone, phone_country, church_other,
              guardian_name, guardian_phone,
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
        let registrantGuardianName: string | null = null;
        let registrantGuardianPhone: string | null = null;
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
              registrantChurch = m.eckcm_people.church_other || m.eckcm_people.eckcm_churches?.name_en || null;
              registrantDept = m.eckcm_people.eckcm_departments?.name_en ?? null;
              registrantGuardianName = m.eckcm_people.guardian_name ?? null;
              registrantGuardianPhone = m.eckcm_people.guardian_phone ?? null;
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
        let stripePaymentIntentId: string | null = null;
        if (invoice) {
          const payments = invoice.eckcm_payments ?? [];
          const successPayment = payments.find((p: any) => p.status === "SUCCEEDED") ?? payments[0];
          if (successPayment) {
            paymentMethod = successPayment.payment_method;
            paymentStatus = successPayment.status;
            stripePaymentIntentId = successPayment.stripe_payment_intent_id ?? null;
          }
        }

        return {
          id: r.id,
          confirmation_code: r.confirmation_code,
          status: r.status,
          registration_type: r.registration_type,
          start_date: r.start_date,
          end_date: r.end_date,
          nights_count: r.nights_count,
          total_amount_cents: r.total_amount_cents,
          notes: r.notes,
          additional_requests: r.additional_requests ?? null,
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
          registrant_guardian_name: registrantGuardianName,
          registrant_guardian_phone: registrantGuardianPhone,
          registration_group_name: r.eckcm_registration_groups?.name_en ?? null,
          invoice_number: invoice?.invoice_number ?? null,
          payment_status: paymentStatus ?? invoice?.status ?? null,
          payment_method: paymentMethod,
          stripe_payment_intent_id: stripePaymentIntentId,
          paid_at: invoice?.paid_at ?? null,
          checked_in: checkedIn,
          checked_out: false,
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

  // Live updates — Realtime + smart polling fallback
  const _reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const _reload = () => {
    if (_reloadTimer.current) clearTimeout(_reloadTimer.current);
    _reloadTimer.current = setTimeout(loadRegistrations, 500);
  };
  useRealtime({ table: "eckcm_registrations", event: "*", filter: `event_id=eq.${eventId}` }, _reload);
  useRealtime({ table: "eckcm_invoices", event: "*" }, _reload);
  useRealtime({ table: "eckcm_payments", event: "*" }, _reload);
  useRealtime({ table: "eckcm_checkins", event: "*", filter: `event_id=eq.${eventId}` }, _reload);

  // Smart polling: only reloads when data actually changed (no UI flicker)
  useChangeDetector("eckcm_registrations", loadRegistrations, 5000, { column: "event_id", value: eventId });
  useChangeDetector("eckcm_payments", loadRegistrations, 5000);

  // ─── Status update ─────────────────────────────────────────────

  const updateStatus = async (regId: string, newStatus: string) => {
    setUpdatingId(regId);
    try {
      const res = await fetch("/api/admin/registration/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: regId, status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update status");
      } else {
        toast.success(`Status updated to ${newStatus}`);
        loadRegistrations();
        if (detailReg?.id === regId) {
          setDetailReg({ ...detailReg, status: newStatus });
        }
      }
    } catch {
      toast.error("Network error");
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
      (r.notes?.toLowerCase().includes(q) ?? false) ||
      (r.additional_requests?.toLowerCase().includes(q) ?? false) ||
      (r.registrant_guardian_name?.toLowerCase().includes(q) ?? false)
    );
  });

  // ─── Summary stats ─────────────────────────────────────────────

  const totalPaid = registrations.filter((r) => r.status === "PAID").length;
  const totalApproved = registrations.filter((r) => r.status === "APPROVED").length;
  const totalAmount = registrations
    .filter((r) => r.status === "PAID")
    .reduce((sum, r) => sum + r.total_amount_cents, 0);
  const totalPeople = registrations
    .filter((r) => r.status === "PAID" || r.status === "APPROVED")
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

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-3">
        <SummaryCard
          icon={<Users className="size-4 text-muted-foreground" />}
          label="Total Registrations"
          value={registrations.length}
        />
        <SummaryCard
          icon={<UserCheck className="size-4 text-green-600" />}
          label="Paid"
          value={totalPaid}
        />
        <SummaryCard
          icon={<ShieldCheck className="size-4 text-emerald-600" />}
          label="Approved"
          value={totalApproved}
        />
        <SummaryCard
          icon={<Users className="size-4 text-blue-600" />}
          label="People (Confirmed)"
          value={totalPeople}
        />
        <SummaryCard
          icon={<DollarSign className="size-4 text-green-600" />}
          label="Collected"
          value={formatMoney(totalAmount)}
        />
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
            <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap w-[120px]">Actions</TableHead>
                    <TableHead className="whitespace-nowrap">No.</TableHead>
                    <TableHead className="whitespace-nowrap">Code</TableHead>
                    <TableHead className="whitespace-nowrap">Name</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">Payment</TableHead>
                    <TableHead className="whitespace-nowrap text-center">C-IN</TableHead>
                    <TableHead className="whitespace-nowrap">Room</TableHead>
                    <TableHead className="whitespace-nowrap text-center">People</TableHead>
                    <TableHead className="whitespace-nowrap">Amount</TableHead>
                    <TableHead className="whitespace-nowrap">Church</TableHead>
                    <TableHead className="whitespace-nowrap">Reg. Group</TableHead>
                    <TableHead className="whitespace-nowrap">Invoice</TableHead>
                    <TableHead className="whitespace-nowrap">Stripe</TableHead>
                    <TableHead className="whitespace-nowrap">Registered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow
                      key={r.id}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      {/* Actions */}
                      <TableCell>
                        <RegistrationActions
                          registration={r}
                          onView={openDetail}
                          onStatusChange={updateStatus}
                          updatingId={updatingId}
                          lockedBy={isLockedByOther(r.id)}
                        />
                      </TableCell>
                      {/* No. */}
                      <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                        {extractSeqNumber(r.confirmation_code)}
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
                      {/* Status */}
                      <TableCell>
                        <Badge variant={statusVariant[r.status] ?? "secondary"} className="text-xs">
                          {r.status}
                        </Badge>
                      </TableCell>
                      {/* Payment — combined method + status */}
                      <TableCell>
                        <div className="space-y-0.5">
                          {r.payment_status && (
                            <Badge
                              variant={paymentStatusVariant[r.payment_status] ?? "secondary"}
                              className="text-xs"
                            >
                              {r.payment_status}
                            </Badge>
                          )}
                          {r.payment_method && (
                            <div className="text-xs text-muted-foreground">
                              {r.payment_method.replace(/_/g, " ")}
                            </div>
                          )}
                          {!r.payment_status && !r.payment_method && (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      {/* C-IN */}
                      <TableCell className="text-center">
                        <Badge variant={r.checked_in ? "default" : "secondary"} className="text-xs">
                          {r.checked_in ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      {/* Room */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.room_numbers.length > 0 ? r.room_numbers.join(", ") : "-"}
                      </TableCell>
                      {/* People */}
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Users className="size-3" />
                          {r.people_count}
                        </span>
                      </TableCell>
                      {/* Amount */}
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {formatMoney(r.total_amount_cents)}
                      </TableCell>
                      {/* Church */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.registrant_church ?? "-"}
                      </TableCell>
                      {/* Reg. Group */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.registration_group_name ?? "-"}
                      </TableCell>
                      {/* Invoice */}
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {r.invoice_number ?? "-"}
                      </TableCell>
                      {/* Stripe Link */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.stripe_payment_intent_id && stripeAccountId ? (
                          <a
                            href={`https://dashboard.stripe.com/${stripeAccountId}/${
                              events.find((e) => e.id === eventId)?.stripe_mode === "live" ? "" : "test/"
                            }payments/${r.stripe_payment_intent_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            <ExternalLink className="size-3" />
                            View
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      {/* Registered */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatTimestamp(r.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={15}
                        className="text-center text-muted-foreground py-8"
                      >
                        No registrations found.
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

      {/* Detail Sheet */}
      <RegistrationDetailSheet
        registration={detailReg}
        events={events}
        eventId={eventId}
        stripeAccountId={stripeAccountId}
        onClose={closeDetail}
        onStatusChange={updateStatus}
        onRefresh={loadRegistrations}
      />
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────

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
