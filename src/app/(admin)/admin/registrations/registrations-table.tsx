"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime, useChangeDetector } from "@/lib/hooks/use-realtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Users, RefreshCw, DollarSign, UserCheck, Star, Clock, Banknote, Wallet, Scale, Flag } from "lucide-react";
import { useTableSort } from "@/lib/hooks/use-table-sort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";

import {
  type Event,
  type RegistrationRow,
  STATUS_OPTIONS,
  formatMoney,
  parseSeqNumber,
  grossCollectedCents,
  netCollectedCents,
} from "./registrations-types";
import { RegistrationDetailSheet } from "./registration-detail-sheet";
import { useRegistrationLock } from "@/lib/hooks/use-registration-lock";
import {
  resolveColumnLayout,
  visibleColumns,
  type ColumnPref,
  type ColumnRenderContext,
} from "./registrations-columns";
import { ColumnSettings } from "./column-settings";

interface RegistrationsTableProps {
  events: Event[];
  currentUserId: string;
  currentUserName: string;
}

/**
 * Row background so admins can spot which registrations have a room assigned.
 * Highlight (star) takes priority; otherwise a reg with a room gets a subtle
 * green tint. Rooms-less rows are left unstyled.
 */
function rowClassName(r: RegistrationRow): string {
  if (r.is_highlighted) return "!bg-yellow-50 dark:!bg-yellow-950/20";
  if (r.room_numbers.length > 0) return "!bg-green-50/60 dark:!bg-green-950/20";
  return "";
}

/**
 * Registration groups for which an additional request alone does NOT warrant
 * attention — these groups routinely fill in requests, so only a note, a
 * highlight, or a pending (non-on-site) payment should surface them.
 * Matched by registration group name (name_en), trimmed.
 */
const REQUESTS_IGNORED_GROUPS = new Set([
  "Hansamo",
  "Hansamo Leader",
  "Hansamo Leader Family",
  "EM Volunteers",
  "EM Coordinators",
]);

/**
 * "Needs Attention" predicate — registrations an admin should look at:
 *  - has an internal note,
 *  - has an additional request from the registrant,
 *  - is starred (highlighted), or
 *  - is SUBMITTED awaiting payment by a non-on-site method (Zelle/Check/etc.),
 *    which means a real follow-up is owed. On-site SUBMITTED regs are expected
 *    to settle at the event, so they're excluded.
 *
 * Exception: for REQUESTS_IGNORED_GROUPS, an additional request on its own
 * does not qualify — those groups must have a note / highlight / pending
 * payment to appear.
 */
function needsAttention(r: RegistrationRow): boolean {
  const hasNote = !!r.notes?.trim();
  const requestsCount = !REQUESTS_IGNORED_GROUPS.has(
    (r.registration_group_name ?? "").trim()
  );
  const hasRequest = requestsCount && !!r.additional_requests?.trim();
  const isPendingNonOnsite =
    r.status === "SUBMITTED" &&
    !(r.payment_method ?? "").toUpperCase().startsWith("ONSITE");
  return hasNote || hasRequest || r.is_highlighted || isPendingNonOnsite;
}

export function RegistrationsTable({ events, currentUserId, currentUserName }: RegistrationsTableProps) {
  const [mounted, setMounted] = useState(false);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightFilter, setHighlightFilter] = useState(false);
  const [attentionFilter, setAttentionFilter] = useState(false);
  const [regGroupFilter, setRegGroupFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");

  const [stripeAccountId, setStripeAccountId] = useState("");
  // Σ per-person manual-payment discount that card payers don't get (the
  // surcharge meant to offset Stripe fees). Fetched server-side for accuracy.
  const [cardSurchargeCents, setCardSurchargeCents] = useState(0);

  // Global (shared) column layout: order + visibility. `null` = code default.
  // Two independent layouts: the normal table view and the Needs Attention view.
  const [columnPrefs, setColumnPrefs] = useState<ColumnPref[] | null>(null);
  const [attentionColumnPrefs, setAttentionColumnPrefs] = useState<ColumnPref[] | null>(null);
  const [columnsSaving, setColumnsSaving] = useState(false);
  // Mirrors for stable access inside the persist callback.
  const columnPrefsRef = useRef<ColumnPref[] | null>(null);
  const attentionColumnPrefsRef = useRef<ColumnPref[] | null>(null);
  useEffect(() => { columnPrefsRef.current = columnPrefs; }, [columnPrefs]);
  useEffect(() => { attentionColumnPrefsRef.current = attentionColumnPrefs; }, [attentionColumnPrefs]);

  // The active layout follows the current mode: Needs Attention has its own
  // saved order/visibility so admins can prioritize different columns there.
  const activePrefs = attentionFilter ? attentionColumnPrefs : columnPrefs;

  // Resolved, render-ready columns reconciled against the current registry.
  const columnLayout = resolveColumnLayout(activePrefs);
  const hiddenColumns = new Set(
    (activePrefs ?? []).filter((c) => !c.visible).map((c) => c.id)
  );
  const renderColumns = visibleColumns(columnLayout, hiddenColumns);

  useEffect(() => setMounted(true), []);

  // Load both shared column layouts once.
  useEffect(() => {
    fetch("/api/admin/registration-columns")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.columns)) setColumnPrefs(data.columns);
        if (data && Array.isArray(data.attentionColumns)) setAttentionColumnPrefs(data.attentionColumns);
      })
      .catch(() => {});
  }, []);

  // Persist a new layout globally (optimistic). On failure, revert + toast.
  // `mode` selects which layout (normal table vs Needs Attention) is saved.
  // Called only on explicit Save / Reset from the column settings editor.
  const persistColumnPrefs = useCallback(
    async (next: ColumnPref[] | null, mode: "default" | "attention") => {
      const isAttention = mode === "attention";
      const ref = isAttention ? attentionColumnPrefsRef : columnPrefsRef;
      const setter = isAttention ? setAttentionColumnPrefs : setColumnPrefs;
      const prev = ref.current;
      setter(next);
      setColumnsSaving(true);
      try {
        const res = await fetch("/api/admin/registration-columns", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columns: next, mode }),
        });
        if (!res.ok) throw new Error("save failed");
        toast.success("Column settings saved");
      } catch {
        setter(prev);
        toast.error("Failed to save column settings");
      } finally {
        setColumnsSaving(false);
      }
    },
    []
  );

  // Save/Reset target the layout for the mode currently being viewed.
  const handleColumnSave = (prefs: ColumnPref[]) =>
    persistColumnPrefs(prefs, attentionFilter ? "attention" : "default");
  const handleColumnReset = () =>
    persistColumnPrefs(null, attentionFilter ? "attention" : "default");

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
        is_highlighted,
        is_processed,
        created_at,
        updated_at,
        registration_group_id,
        eckcm_registration_groups(name_en),
        eckcm_invoices(
          id,
          invoice_number,
          status,
          total_cents,
          paid_at,
          issued_at,
          eckcm_payments(payment_method, status, stripe_payment_intent_id, amount_cents)
        ),
        eckcm_groups(
          id,
          display_group_code,
          lodging_type,
          preferences,
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

    // Fetch all real MAIN check-ins for this event (arrival check-in + checkout).
    // Sandbox (test-scan) rows are excluded from real attendance status.
    const { data: checkins } = await supabase
      .from("eckcm_checkins")
      .select("person_id, checked_out_at")
      .eq("event_id", eventId)
      .eq("checkin_type", "MAIN")
      .eq("is_sandbox", false);

    const checkinSet = new Set(
      (checkins ?? []).map((c) => c.person_id)
    );
    const checkoutSet = new Set(
      (checkins ?? []).filter((c) => c.checked_out_at).map((c) => c.person_id)
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
        let repFound = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let fallbackMember: any = null;
        // Every participant's person_id — used to derive registration-level
        // check-in/out (checked-in/out if ANY participant is).
        const memberPersonIds: string[] = [];
        const roomNumbers: string[] = [];
        let lodgingType: string | null = null;
        let preferences: { elderly: boolean; handicapped: boolean; firstFloor: boolean } | null = null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const applyRegistrant = (m: any) => {
          registrantName = `${m.eckcm_people.first_name_en} ${m.eckcm_people.last_name_en}`;
          registrantNameKo = m.eckcm_people.display_name_ko;
          registrantEmail = m.eckcm_people.email;
          registrantPhone = m.eckcm_people.phone;
          registrantChurch = m.eckcm_people.church_other || m.eckcm_people.eckcm_churches?.name_en || null;
          registrantDept = m.eckcm_people.eckcm_departments?.name_en ?? null;
          registrantGuardianName = m.eckcm_people.guardian_name ?? null;
          registrantGuardianPhone = m.eckcm_people.guardian_phone ?? null;
        };

        for (const g of groups) {
          // Lodging type & preferences (take from first group)
          if (!lodgingType && g.lodging_type) lodgingType = g.lodging_type;
          if (!preferences && g.preferences) preferences = g.preferences as typeof preferences;

          // Room assignments — PostgREST returns single object when target FK has a UNIQUE
          // constraint (group_id), so normalize to array before iterating.
          const raRaw = g.eckcm_room_assignments;
          const roomAssignments = Array.isArray(raRaw) ? raRaw : raRaw ? [raRaw] : [];
          for (const ra of roomAssignments) {
            if (ra.eckcm_rooms?.room_number) {
              roomNumbers.push(ra.eckcm_rooms.room_number);
            }
          }

          const members = g.eckcm_group_memberships ?? [];
          peopleCount += members.length;
          for (const m of members) {
            if (m.person_id) memberPersonIds.push(m.person_id);
            if (m.role === "REPRESENTATIVE" && !repFound) {
              repFound = true;
              applyRegistrant(m);
            } else if (!fallbackMember) {
              // Remember the first non-representative member as a fallback for
              // registrations that have no representative (e.g. the rep was
              // transferred out). Prevents the row from showing "Unknown".
              fallbackMember = m;
            }
          }
        }

        // No representative found — fall back to the first member so the row
        // still shows a name instead of "Unknown".
        if (!repFound && fallbackMember) {
          applyRegistrant(fallbackMember);
        }

        // Registration-level check-in: checked-in if ANY participant is.
        const checkedIn = memberPersonIds.some((pid) => checkinSet.has(pid));

        // Invoice & payment info. Default to the PRIMARY (original) invoice = the
        // oldest one. But when the registration is awaiting payment (SUBMITTED) and
        // owes an additional amount, surface its OUTSTANDING invoice = the oldest
        // unpaid one (a folded-in or separate "Custom Charge"), so the badge reads
        // PENDING and the manual-settle / card-link controls appear. Fully-paid regs
        // (incl. historical auto-paid -C invoices) have no outstanding invoice → the
        // primary is used exactly as before.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoices = [...(r.eckcm_invoices ?? [])].sort(
          (a: any, b: any) =>
            new Date(a.issued_at ?? 0).getTime() - new Date(b.issued_at ?? 0).getTime()
        );
        const primaryInvoice = invoices[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const outstandingInvoice = invoices.find(
          (inv: any) =>
            !["SUCCEEDED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(inv.status) &&
            (inv.eckcm_payments ?? []).length > 0
        );
        const invoice =
          r.status === "SUBMITTED" && outstandingInvoice
            ? outstandingInvoice
            : primaryInvoice;
        let paymentMethod: string | null = null;
        let paymentStatus: string | null = null;
        let stripePaymentIntentId: string | null = null;
        let paymentAmountCents: number = 0;
        if (invoice) {
          const payments = invoice.eckcm_payments ?? [];
          const successPayment = payments.find((p: any) => p.status === "SUCCEEDED") ?? payments[0];
          if (successPayment) {
            paymentMethod = successPayment.payment_method;
            paymentStatus = successPayment.status;
            stripePaymentIntentId = successPayment.stripe_payment_intent_id ?? null;
            paymentAmountCents = successPayment.amount_cents ?? 0;
          }
        }

        // Split the registration's money into already-PAID (SUCCEEDED invoices) vs
        // still-OWED (outstanding invoices, e.g. a pending Custom Charge), so a charge
        // added on top of a paid registration shows a clear "paid vs balance due".
        const paidAmountCents = invoices
          .filter((iv) => iv.status === "SUCCEEDED")
          .reduce((sum, iv) => sum + (iv.total_cents ?? 0), 0);
        const balanceDueCents = invoices
          .filter(
            (iv) => !["SUCCEEDED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(iv.status)
          )
          .reduce((sum, iv) => sum + (iv.total_cents ?? 0), 0);

        return {
          id: r.id,
          confirmation_code: r.confirmation_code,
          status: r.status,
          registration_type: r.registration_type,
          start_date: r.start_date,
          end_date: r.end_date,
          nights_count: r.nights_count,
          total_amount_cents: r.total_amount_cents,
          paid_amount_cents: paidAmountCents,
          balance_due_cents: balanceDueCents,
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
          registration_group_id: r.registration_group_id ?? null,
          registration_group_name: r.eckcm_registration_groups?.name_en ?? null,
          invoice_id: invoice?.id ?? null,
          invoice_number: invoice?.invoice_number ?? null,
          payment_status: paymentStatus ?? invoice?.status ?? null,
          payment_method: paymentMethod,
          stripe_payment_intent_id: stripePaymentIntentId,
          payment_amount_cents: paymentAmountCents,
          paid_at: invoice?.paid_at ?? null,
          checked_in: checkedIn,
          checked_out: memberPersonIds.some((pid) => checkoutSet.has(pid)),
          room_numbers: roomNumbers,
          lodging_type: lodgingType,
          preferences,
          is_highlighted: r.is_highlighted ?? false,
          is_processed: r.is_processed ?? false,
          seq_number: parseSeqNumber(r.confirmation_code),
        };
      });
      setRegistrations(rows);
      // Keep an open detail sheet in sync with freshly loaded data (the sheet
      // holds a snapshot, so editable sections that call onRefresh reflect
      // their changes without needing a reopen).
      setDetailReg((prev) => (prev ? rows.find((r) => r.id === prev.id) ?? prev : prev));
    }

    // Card surcharge (discount card payers didn't get) — server computes the
    // accurate billable-people basis. Non-fatal if it fails.
    try {
      const res = await fetch(`/api/admin/registrations/card-surcharge?eventId=${eventId}`);
      if (res.ok) {
        const data = await res.json();
        setCardSurchargeCents(data.surchargeCents ?? 0);
      }
    } catch {
      // leave previous value
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

  // ─── Highlight toggle ───────────────────────────────────────────
  const [highlightConfirm, setHighlightConfirm] = useState<{ regId: string; current: boolean; name: string } | null>(null);

  const executeHighlightToggle = async (regId: string, current: boolean) => {
    const supabase = createClient();
    const newVal = !current;
    // Optimistic update
    setRegistrations((prev) =>
      prev.map((r) => (r.id === regId ? { ...r, is_highlighted: newVal } : r))
    );
    if (detailReg?.id === regId) {
      setDetailReg((prev) => prev ? { ...prev, is_highlighted: newVal } : prev);
    }
    const { error } = await supabase
      .from("eckcm_registrations")
      .update({ is_highlighted: newVal })
      .eq("id", regId);
    if (error) {
      setRegistrations((prev) =>
        prev.map((r) => (r.id === regId ? { ...r, is_highlighted: current } : r))
      );
      toast.error("Failed to update highlight");
    }
  };

  // ─── Processed (handled) toggle ─────────────────────────────────
  // Manual admin housekeeping marker. Global, no row styling change.
  const [processedConfirm, setProcessedConfirm] = useState<{ regId: string; current: boolean; name: string } | null>(null);

  const executeProcessedToggle = async (regId: string, current: boolean) => {
    const supabase = createClient();
    const newVal = !current;
    // Optimistic update
    setRegistrations((prev) =>
      prev.map((r) => (r.id === regId ? { ...r, is_processed: newVal } : r))
    );
    if (detailReg?.id === regId) {
      setDetailReg((prev) => prev ? { ...prev, is_processed: newVal } : prev);
    }
    const { error } = await supabase
      .from("eckcm_registrations")
      .update({ is_processed: newVal })
      .eq("id", regId);
    if (error) {
      setRegistrations((prev) =>
        prev.map((r) => (r.id === regId ? { ...r, is_processed: current } : r))
      );
      toast.error("Failed to update processed status");
    }
  };

  // ─── Filter ────────────────────────────────────────────────────

  // Distinct option lists derived from currently loaded rows.
  const regGroupOptions = Array.from(
    new Set(registrations.map((r) => r.registration_group_name).filter((v): v is string => !!v))
  ).sort((a, b) => a.localeCompare(b));
  const departmentOptions = Array.from(
    new Set(registrations.map((r) => r.registrant_department).filter((v): v is string => !!v))
  ).sort((a, b) => a.localeCompare(b));

  const filtered = registrations.filter((r) => {
    if (highlightFilter && !r.is_highlighted) return false;
    if (attentionFilter && !needsAttention(r)) return false;
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    if (regGroupFilter !== "ALL" && r.registration_group_name !== regGroupFilter) return false;
    if (departmentFilter !== "ALL" && r.registrant_department !== departmentFilter) return false;
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

  const { sortedData: sorted, sortConfig, requestSort } = useTableSort(filtered);

  // Context handed to each column's cell renderer.
  const columnCtx: ColumnRenderContext = {
    events,
    eventId,
    stripeAccountId,
    updatingId,
    isLockedByOther,
    openDetail,
    updateStatus,
    setHighlightConfirm,
    setProcessedConfirm,
  };

  // ─── Summary stats ─────────────────────────────────────────────

  const totalPaid = registrations.filter((r) => r.status === "PAID").length;
  // "Unpaid" = submitted but not yet paid (awaiting Zelle/Check/On-Site, etc.)
  const totalUnpaid = registrations.filter((r) => r.status === "SUBMITTED").length;

  // Gross = face value people paid; Net = real money kept after Stripe fees.
  const grossCollected = registrations
    .filter((r) => r.status === "PAID")
    .reduce((sum, r) => sum + grossCollectedCents(r), 0);
  const netCollected = registrations
    .filter((r) => r.status === "PAID")
    .reduce((sum, r) => sum + netCollectedCents(r), 0);

  // Card fee reconciliation: surcharge collected from card payers vs. the
  // actual Stripe fees taken (Gross − Net). Positive = the per-person premium
  // more than covered fees; negative = the church absorbed the difference.
  const actualStripeFeesCents = grossCollected - netCollected;
  const feeBalanceCents = cardSurchargeCents - actualStripeFeesCents;

  // Amount still owed across all SUBMITTED (unpaid) registrations.
  const amountDue = registrations
    .filter((r) => r.status === "SUBMITTED")
    .reduce((sum, r) => sum + r.total_amount_cents, 0);

  // Confirmed = PAID + APPROVED; Submitted total also counts SUBMITTED.
  const peopleConfirmed = registrations
    .filter((r) => r.status === "PAID" || r.status === "APPROVED")
    .reduce((sum, r) => sum + r.people_count, 0);
  const peopleSubmitted = registrations
    .filter((r) => r.status === "PAID" || r.status === "APPROVED" || r.status === "SUBMITTED")
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

        <Select value={regGroupFilter} onValueChange={setRegGroupFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Reg. Groups</SelectItem>
            {regGroupOptions.map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
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
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SearchInput
          placeholder="Search code, name, room..."
          value={search}
          onValueChange={setSearch}
          containerClassName="max-w-[250px]"
        />

        <Button
          variant={highlightFilter ? "default" : "outline"}
          size="sm"
          onClick={() => setHighlightFilter(!highlightFilter)}
          className="gap-1.5"
        >
          <Star className={`size-3.5 ${highlightFilter ? "fill-current" : ""}`} />
          Highlighted
          {highlightFilter && (
            <span className="text-xs">
              ({registrations.filter((r) => r.is_highlighted).length})
            </span>
          )}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setAttentionFilter(!attentionFilter)}
          className={`gap-1.5 ${
            attentionFilter
              ? "bg-red-600 text-white hover:bg-red-700 hover:text-white border-red-600"
              : "border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
          }`}
          title="Notes, additional requests, highlighted, or awaiting non-on-site payment"
        >
          <Flag className={`size-3.5 ${attentionFilter ? "fill-current" : ""}`} />
          Needs Attention
          {attentionFilter && (
            <span className="text-xs">
              ({registrations.filter(needsAttention).length})
            </span>
          )}
        </Button>

        <Button variant="ghost" size="icon" onClick={loadRegistrations}>
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {/* Summary Cards — wraps to a second row on narrower screens */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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
          icon={<Clock className="size-4 text-amber-600" />}
          label="Unpaid (Submitted)"
          value={totalUnpaid}
        />
        <SummaryCard
          icon={<DollarSign className="size-4 text-amber-600" />}
          label="Amount Due"
          value={formatMoney(amountDue)}
        />
        <SummaryCard
          icon={<Users className="size-4 text-blue-600" />}
          label="People (Confirmed)"
          value={peopleConfirmed}
        />
        <SummaryCard
          icon={<Users className="size-4 text-sky-600" />}
          label="People (Submitted)"
          value={peopleSubmitted}
        />
        <SummaryCard
          icon={<Banknote className="size-4 text-green-600" />}
          label="Net Collected"
          value={formatMoney(netCollected)}
        />
        <SummaryCard
          icon={<Wallet className="size-4 text-emerald-600" />}
          label="Gross Collected"
          value={formatMoney(grossCollected)}
        />
        <SummaryCard
          icon={<Scale className="size-4 text-muted-foreground" />}
          label="Card Fee Balance"
          value={`${feeBalanceCents >= 0 ? "+" : "−"}${formatMoney(Math.abs(feeBalanceCents))}`}
          valueClassName={feeBalanceCents >= 0 ? "text-green-600" : "text-red-600"}
          hint={`Surcharge ${formatMoney(cardSurchargeCents)} − Fees ${formatMoney(actualStripeFeesCents)}`}
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {sorted.length} registration(s)
            </CardTitle>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="inline-block size-3 rounded-sm border bg-green-50 dark:bg-green-950/40" />
                Room assigned
              </span>
              <ColumnSettings
                layout={columnLayout}
                hidden={hiddenColumns}
                saving={columnsSaving}
                attentionMode={attentionFilter}
                onSave={handleColumnSave}
                onReset={handleColumnReset}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : (
            <>
            <ScrollSyncedTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    {renderColumns.map((col) => {
                      const headClass = `whitespace-nowrap${col.center ? " text-center" : ""}${col.headClassName ? ` ${col.headClassName}` : ""}`;
                      return col.sortKey ? (
                        <SortableTableHead
                          key={col.id}
                          className={headClass}
                          sortKey={col.sortKey}
                          sortConfig={sortConfig}
                          onSort={requestSort}
                        >
                          {col.label}
                        </SortableTableHead>
                      ) : (
                        <TableHead key={col.id} className={headClass}>
                          {col.label}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((r) => (
                    <TableRow
                      key={r.id}
                      className={`hover:bg-muted/50 transition-colors ${rowClassName(r)}`}
                    >
                      {renderColumns.map((col) => (
                        <TableCell key={col.id} className={col.center ? "text-center" : undefined}>
                          {col.render(r, columnCtx)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={renderColumns.length}
                        className="text-center text-muted-foreground py-8"
                      >
                        No registrations found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollSyncedTable>

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

      {/* Highlight Confirmation Dialog */}
      {highlightConfirm && (
        <AlertDialog open onOpenChange={(open) => !open && setHighlightConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Star className={`size-5 ${highlightConfirm.current ? "text-muted-foreground" : "fill-yellow-400 text-yellow-400"}`} />
                {highlightConfirm.current ? "Remove Highlight" : "Highlight Registration"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {highlightConfirm.current
                  ? <>Remove highlight from <strong>{highlightConfirm.name}</strong>?</>
                  : <>Highlight <strong>{highlightConfirm.name}</strong>? Highlighted registrations can be filtered using the Highlighted button.</>
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  executeHighlightToggle(highlightConfirm.regId, highlightConfirm.current);
                  setHighlightConfirm(null);
                }}
              >
                {highlightConfirm.current ? "Remove" : "Highlight"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Processed Confirmation Dialog */}
      {processedConfirm && (
        <AlertDialog open onOpenChange={(open) => !open && setProcessedConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {processedConfirm.current ? "Mark as Not Processed" : "Mark as Processed"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {processedConfirm.current
                  ? <>Remove the processed mark from <strong>{processedConfirm.name}</strong>?</>
                  : <>Mark <strong>{processedConfirm.name}</strong> as processed? This is a manual housekeeping flag shared across all admins — it does not change the registration itself.</>
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  executeProcessedToggle(processedConfirm.regId, processedConfirm.current);
                  setProcessedConfirm(null);
                }}
              >
                {processedConfirm.current ? "Unmark" : "Mark Processed"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ─── Scroll-synced table wrapper ───────────────────────────
// Renders a thin scrollbar above the table that mirrors the table's horizontal
// scroll. Lets admins page through wide tables without scrolling to the bottom.
function ScrollSyncedTable({ children }: { children: React.ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const syncing = useRef<"top" | "bottom" | null>(null);

  // Track the inner table's scroll width so the top spacer matches.
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const update = () => setContentWidth(el.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Children mutations (sort/filter) can change inner width without resize.
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, []);

  const onTopScroll = () => {
    if (syncing.current === "bottom") { syncing.current = null; return; }
    if (!topRef.current || !bottomRef.current) return;
    syncing.current = "top";
    bottomRef.current.scrollLeft = topRef.current.scrollLeft;
  };
  const onBottomScroll = () => {
    if (syncing.current === "top") { syncing.current = null; return; }
    if (!topRef.current || !bottomRef.current) return;
    syncing.current = "bottom";
    topRef.current.scrollLeft = bottomRef.current.scrollLeft;
  };

  return (
    <>
      <div
        ref={topRef}
        onScroll={onTopScroll}
        className="overflow-x-auto"
        aria-hidden
      >
        <div style={{ width: contentWidth, height: 1 }} />
      </div>
      <div ref={bottomRef} onScroll={onBottomScroll} className="overflow-x-auto">
        {children}
      </div>
    </>
  );
}

// ─── Summary Card ─────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  hint,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={`text-xl font-bold mt-1 ${valueClassName ?? ""}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}
