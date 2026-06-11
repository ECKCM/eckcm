"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ExternalLink,
  Copy,
  Users,
  CreditCard,
  CalendarDays,
  FileText,
  AlertTriangle,
  User,
  Phone,
  Mail,
  Church,
  Building2,
  ShieldCheck,
  Plus,
  Loader2,
  Pencil,
  Save,
  Send,
  X,
  Trash2,
  ArrowRightLeft,
  BedDouble,
  Link2,
  PlaneLanding,
  PlaneTakeoff,
} from "lucide-react";
import { toast } from "sonner";
import { ChurchCombobox } from "@/components/shared/church-combobox";
import { MealSelectionGrid } from "@/components/registration/meal-selection-grid";
import type { MealSelection } from "@/lib/types/registration";
import type { MealType } from "@/lib/types/database";
import {
  type RegistrationRow,
  type PersonDetail,
  type Event,
  type TransferOutRecord,
  type TransferInRecord,
  statusVariant,
  paymentStatusVariant,
  formatMoney,
  formatTimestamp,
  VALID_STATUSES,
  calculateProcessingFee,
  calculateProportionalProcessingFee,
  MIN_REFUND_CENTS,
} from "./registrations-types";
import { isManualPaymentMethod, EDITABLE_PAYMENT_METHODS } from "@/lib/payment/methods";
import { MoneyValue } from "@/contexts/money-visibility-context";

interface RegistrationDetailSheetProps {
  registration: RegistrationRow | null;
  events: Event[];
  eventId: string;
  stripeAccountId: string;
  onClose: () => void;
  onStatusChange: (regId: string, newStatus: string) => Promise<void>;
  onRefresh: () => void;
}

export function RegistrationDetailSheet({
  registration,
  events,
  eventId,
  stripeAccountId,
  onClose,
  onStatusChange,
  onRefresh,
}: RegistrationDetailSheetProps) {
  const [people, setPeople] = useState<PersonDetail[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [transfersOut, setTransfersOut] = useState<TransferOutRecord[]>([]);
  const [transfersIn, setTransfersIn] = useState<TransferInRecord[]>([]);
  const [churches, setChurches] = useState<{ id: string; name_en: string; name_ko: string | null; is_other: boolean }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name_en: string }[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    status: string;
    label: string;
  } | null>(null);
  // All registrations for transfer dropdown
  const [allRegistrations, setAllRegistrations] = useState<{ id: string; confirmation_code: string; registrant_name: string; status: string }[]>([]);
  // Groups for this registration (for room change)
  const [groups, setGroups] = useState<{
    id: string;
    display_group_code: string;
    room_number: string | null;
    room_id: string | null;
    lodging_type: string | null;
    preferences: { elderly: boolean; handicapped: boolean; firstFloor: boolean } | null;
    key_count: number;
  }[]>([]);
  // Registration groups for this event (for editable dropdown)
  const [registrationGroups, setRegistrationGroups] = useState<{ id: string; name_en: string }[]>([]);
  // Event start/end dates (for meal grid: excludes arrival/departure days)
  const [eventDates, setEventDates] = useState<{ start: string; end: string } | null>(null);
  // All rooms for room change dropdown
  const [allRooms, setAllRooms] = useState<{ id: string; room_number: string; building_name: string; floor_number: string }[]>([]);
  // Available lodging options for this event's registration group
  const [lodgingOptions, setLodgingOptions] = useState<{ code: string; name_en: string }[]>([]);
  // Total already refunded for this registration's payment (cents). Surfaced in the
  // Payment & Invoice card so a partial refund is visible at a glance — without it,
  // the card showed the original total with no sign a refund had happened.
  const [refundedCents, setRefundedCents] = useState(0);

  // Load churches, departments, all registrations, and rooms once
  useEffect(() => {
    const supabase = createClient();
    supabase.from("eckcm_churches").select("id, name_en, name_ko, is_other").eq("is_active", true).order("is_other", { ascending: false }).order("name_en").then(({ data }) => setChurches(data ?? []));
    supabase.from("eckcm_departments").select("id, name_en").order("name_en").then(({ data }) => setDepartments(data ?? []));
    // Load all registrations for transfer (exclude cancelled/refunded)
    supabase
      .from("eckcm_registrations")
      .select(`id, confirmation_code, status, eckcm_groups(eckcm_group_memberships(role, eckcm_people(first_name_en, last_name_en)))`)
      .eq("event_id", eventId)
      .in("status", ["DRAFT", "SUBMITTED", "APPROVED", "PAID"])
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = (data ?? []).map((r: any) => {
          let registrantName = "-";
          let fallbackName: string | null = null;
          for (const g of r.eckcm_groups ?? []) {
            for (const m of g.eckcm_group_memberships ?? []) {
              if (!m.eckcm_people) continue;
              const name = `${m.eckcm_people.first_name_en} ${m.eckcm_people.last_name_en}`;
              if (m.role === "REPRESENTATIVE") {
                registrantName = name;
              } else if (!fallbackName) {
                fallbackName = name;
              }
            }
          }
          // Fall back to the first member when there's no representative.
          if (registrantName === "-" && fallbackName) registrantName = fallbackName;
          return { id: r.id, confirmation_code: r.confirmation_code, registrant_name: registrantName, status: r.status };
        });
        setAllRegistrations(rows);
      });
    // Load all rooms
    supabase
      .from("eckcm_rooms")
      .select("id, room_number, is_available, eckcm_floors!inner(floor_number, name_en, eckcm_buildings!inner(name_en))")
      .eq("is_available", true)
      .order("room_number")
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAllRooms((data ?? []).map((r: any) => ({
          id: r.id,
          room_number: r.room_number,
          building_name: r.eckcm_floors?.eckcm_buildings?.name_en ?? "",
          floor_number: r.eckcm_floors?.floor_number ?? "",
        })));
      });
    // Load all lodging fee categories for this event
    supabase
      .from("eckcm_fee_categories")
      .select("code, name_en")
      .like("code", "LODGING_%")
      .neq("code", "LODGING_EXTRA")
      .eq("is_active", true)
      .order("code")
      .then(({ data }) => setLodgingOptions(data ?? []));
    // Registration groups for this event (for the editable dropdown)
    supabase
      .from("eckcm_registration_groups")
      .select("id, name_en")
      .eq("event_id", eventId)
      .order("name_en")
      .then(({ data }) => setRegistrationGroups(data ?? []));
    // Event start/end (used by MealSelectionGrid to skip arrival/departure)
    supabase
      .from("eckcm_events")
      .select("event_start_date, event_end_date")
      .eq("id", eventId)
      .single()
      .then(({ data }) => {
        if (data) setEventDates({ start: data.event_start_date, end: data.event_end_date });
      });
  }, [eventId]);

  // Load participants and groups when registration changes
  useEffect(() => {
    if (!registration) {
      setPeople([]);
      setGroups([]);
      setTransfersOut([]);
      setTransfersIn([]);
      setRefundedCents(0);
      return;
    }
    loadPeople(registration.id);
    loadGroups(registration.id);
    loadTransfers(registration.id);
    loadRefundedTotal(registration.id);
  }, [registration?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPeople = async (regId: string) => {
    setLoadingPeople(true);
    const supabase = createClient();
    const buildSelect = (includeChurchRole: boolean) => `
        id,
        group_id,
        role,
        participant_code,
        stay_start_date,
        stay_end_date,
        eckcm_people!inner(
          id, first_name_en, last_name_en, display_name_ko,
          gender, birth_date, age_at_event, is_k12, grade,
          email, phone, phone_country, church_id, church_other${includeChurchRole ? ", church_role" : ""},
          department_id, guardian_name, guardian_phone,
          eckcm_churches(id, name_en),
          eckcm_departments(id, name_en)
        ),
        eckcm_groups!inner(id, display_group_code, registration_id)
      `;

    // Try with church_role; if the column doesn't exist yet (migration not
    // applied), retry without it so the rest of the panel still works.
    let { data, error } = await supabase
      .from("eckcm_group_memberships")
      .select(buildSelect(true))
      .eq("eckcm_groups.registration_id", regId);

    if (error && /church_role/i.test(error.message ?? "")) {
      console.warn("[loadPeople] church_role column missing; retrying without it. Apply migration 20260525130000.");
      ({ data, error } = await supabase
        .from("eckcm_group_memberships")
        .select(buildSelect(false))
        .eq("eckcm_groups.registration_id", regId));
    }

    if (error) {
      console.error("[loadPeople] query failed:", error);
      toast.error(`Failed to load participants: ${error.message}`);
    }

    // Load all meal selections for this registration in a single query;
    // grouped by person_id below so each PersonCard gets its own subset.
    const { data: mealRows, error: mealError } = await supabase
      .from("eckcm_meal_selections")
      .select("person_id, meal_date, meal_type, is_selected")
      .eq("registration_id", regId);
    if (mealError) {
      console.warn("[loadPeople] meal selections query failed:", mealError);
    }
    const mealsByPerson = new Map<string, { meal_date: string; meal_type: string; is_selected: boolean }[]>();
    for (const r of mealRows ?? []) {
      const arr = mealsByPerson.get(r.person_id) ?? [];
      arr.push({ meal_date: r.meal_date, meal_type: r.meal_type, is_selected: !!r.is_selected });
      mealsByPerson.set(r.person_id, arr);
    }

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: PersonDetail[] = data.map((m: any) => ({
        person_id: m.eckcm_people.id,
        membership_id: m.id,
        group_id: m.group_id,
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
        church_id: m.eckcm_people.church_id ?? m.eckcm_people.eckcm_churches?.id ?? null,
        church_name:
          m.eckcm_people.church_other ||
          m.eckcm_people.eckcm_churches?.name_en ||
          null,
        church_other: m.eckcm_people.church_other,
        department_id: m.eckcm_people.department_id ?? m.eckcm_people.eckcm_departments?.id ?? null,
        department_name: m.eckcm_people.eckcm_departments?.name_en ?? null,
        church_role: m.eckcm_people.church_role ?? null,
        guardian_name: m.eckcm_people.guardian_name,
        guardian_phone: m.eckcm_people.guardian_phone,
        group_code: m.eckcm_groups.display_group_code,
        role: m.role,
        participant_code: m.participant_code,
        stay_start_date: m.stay_start_date ?? null,
        stay_end_date: m.stay_end_date ?? null,
        meal_selections: mealsByPerson.get(m.eckcm_people.id) ?? [],
      }));
      setPeople(mapped);
    }
    setLoadingPeople(false);
  };

  const loadGroups = async (regId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_groups")
      .select(`
        id, display_group_code, lodging_type, preferences, key_count,
        eckcm_room_assignments(eckcm_rooms(id, room_number))
      `)
      .eq("registration_id", regId);

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setGroups(data.map((g: any) => {
        const raRaw = g.eckcm_room_assignments;
        const ra = Array.isArray(raRaw) ? raRaw[0] : raRaw ?? null;
        return {
          id: g.id,
          display_group_code: g.display_group_code,
          lodging_type: g.lodging_type ?? null,
          room_number: ra?.eckcm_rooms?.room_number ?? null,
          room_id: ra?.eckcm_rooms?.id ?? null,
          preferences: g.preferences ?? { elderly: false, handicapped: false, firstFloor: false },
          key_count: g.key_count ?? 0,
        };
      }));
    }
  };

  const loadTransfers = async (regId: string) => {
    try {
      const res = await fetch(`/api/admin/registrations/${regId}/transfers`);
      if (!res.ok) return;
      const data = await res.json();
      setTransfersOut(data.out ?? []);
      setTransfersIn(data.in ?? []);
    } catch {
      // Non-fatal — the rest of the panel still works without transfer history.
    }
  };

  // Pull the running refund total from the adjustments summary (same source the
  // Adjustments tab uses) so the Overview card can show how much was refunded.
  const loadRefundedTotal = async (regId: string) => {
    try {
      const res = await fetch(`/api/admin/registrations/${regId}/adjustments`);
      if (!res.ok) {
        setRefundedCents(0);
        return;
      }
      const data = await res.json();
      setRefundedCents(data.summary?.total_refunded ?? 0);
    } catch {
      setRefundedCents(0);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!registration) return;
    setConfirmAction({
      status: newStatus,
      label:
        newStatus === "CANCELLED"
          ? "Cancel Registration"
          : newStatus === "REFUNDED"
            ? "Mark as Refunded"
            : `Change to ${newStatus}`,
    });
  };

  const executeStatusChange = async (newStatus: string) => {
    if (!registration) return;
    setUpdatingStatus(true);
    await onStatusChange(registration.id, newStatus);
    setUpdatingStatus(false);
    setConfirmAction(null);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const reg = registration;
  if (!reg) return null;

  const stripeUrl =
    reg.stripe_payment_intent_id && stripeAccountId
      ? `https://dashboard.stripe.com/${stripeAccountId}/${
          events.find((e) => e.id === eventId)?.stripe_mode === "live"
            ? ""
            : "test/"
        }payments/${reg.stripe_payment_intent_id}`
      : null;

  const representative = people.find((p) => p.role === "REPRESENTATIVE");
  const members = people.filter((p) => p.role !== "REPRESENTATIVE");
  // Map membership_id -> source confirmation_code for participants cloned in.
  const transferredInByMembership = new Map(
    transfersIn
      .filter((t) => t.to_membership_id)
      .map((t) => [t.to_membership_id as string, t.from_confirmation_code] as const)
  );

  return (
    <>
      <Sheet open={!!registration} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto"
        >
          <SheetHeader className="pb-4">
            <div className="flex items-start justify-between pr-8">
              <div>
                <SheetTitle className="text-xl">
                  {reg.registrant_name}
                  {reg.registrant_name_ko && (
                    <span className="ml-2 text-base font-normal text-muted-foreground">
                      ({reg.registrant_name_ko})
                    </span>
                  )}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-2 mt-1">
                  <span className="font-mono">{reg.confirmation_code}</span>
                  <button
                    onClick={() =>
                      copyToClipboard(reg.confirmation_code, "Code")
                    }
                    className="text-muted-foreground hover:text-foreground active:scale-90 active:opacity-70 transition-all"
                  >
                    <Copy className="size-3" />
                  </button>
                </SheetDescription>
              </div>
            </div>

            {/* Status badges row */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge
                variant={statusVariant[reg.status] ?? "secondary"}
                className="text-xs"
              >
                {reg.status}
              </Badge>
              {reg.payment_status && (
                <Badge
                  variant={
                    paymentStatusVariant[reg.payment_status] ?? "secondary"
                  }
                  className="text-xs"
                >
                  PAY: {reg.payment_status}
                </Badge>
              )}
              <Badge
                variant={reg.checked_in ? "default" : "secondary"}
                className="text-xs"
              >
                {reg.checked_in ? "Checked In" : "Not Checked In"}
              </Badge>
              {reg.checked_out && (
                <Badge variant="default" className="text-xs">
                  Checked Out
                </Badge>
              )}
            </div>
          </SheetHeader>

          <Separator />

          <Tabs defaultValue="overview" className="mt-4">
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1">
                Overview
              </TabsTrigger>
              <TabsTrigger value="participants" className="flex-1">
                Participants ({reg.people_count})
              </TabsTrigger>
              <TabsTrigger value="adjustments" className="flex-1">
                Adjustments
              </TabsTrigger>
            </TabsList>

            {/* ─── Overview Tab ─── */}
            <TabsContent value="overview" className="space-y-5 mt-4">
              {/* Key Metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="min-w-0 overflow-hidden rounded-lg border p-3 text-center">
                  <p className="truncate text-xl font-bold tabular-nums sm:text-2xl">
                    <MoneyValue>
                      {(() => {
                        if (reg.status === "CANCELLED" || reg.status === "REFUNDED") return formatMoney(0);
                        if (
                          (reg.payment_status === "PARTIALLY_REFUNDED" || reg.payment_status === "REFUNDED") &&
                          reg.total_amount_cents > 0 &&
                          reg.total_amount_cents <= calculateProcessingFee(reg.payment_amount_cents, reg.payment_method)
                        ) return formatMoney(0);
                        return formatMoney(reg.total_amount_cents);
                      })()}
                    </MoneyValue>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Total Amount
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">{reg.people_count}</p>
                  <p className="text-xs text-muted-foreground mt-1">People</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">{reg.nights_count}</p>
                  <p className="text-xs text-muted-foreground mt-1">Nights</p>
                </div>
              </div>

              {/* Check-in / Check-out (editable) */}
              <CheckinSection registration={reg} onChanged={onRefresh} />

              <Separator />

              {/* Payment & Invoice */}
              <section>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <CreditCard className="size-4" />
                  Payment & Invoice
                </h3>
                {/* Paid vs. owed split — surfaced when an additional charge (or an
                    unpaid balance) leaves an outstanding amount, so the admin settles
                    only the balance due, not the already-paid total. */}
                {reg.balance_due_cents > 0 && (
                  <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Amount Paid</p>
                      <p className="text-base font-semibold">
                        <MoneyValue>{formatMoney(reg.paid_amount_cents)}</MoneyValue>
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-amber-700">Balance Due</p>
                      <p className="text-base font-bold text-amber-700">
                        <MoneyValue>{formatMoney(reg.balance_due_cents)}</MoneyValue>
                      </p>
                    </div>
                  </div>
                )}
                {/* Refund summary — surfaced whenever any amount has been refunded so
                    the card reflects the refund (the invoice total itself is kept at
                    face value; refunds are tracked separately). "Net Kept" = what the
                    church actually retained = paid − refunded. See the Adjustments tab
                    for the full per-refund breakdown. */}
                {refundedCents > 0 && (
                  <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                    <div>
                      <p className="text-[11px] text-red-700">Refunded</p>
                      <p className="text-base font-bold text-red-700">
                        <MoneyValue>{`−${formatMoney(refundedCents)}`}</MoneyValue>
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Net Kept</p>
                      <p className="text-base font-semibold">
                        <MoneyValue>
                          {formatMoney(
                            Math.max(0, reg.payment_amount_cents - refundedCents)
                          )}
                        </MoneyValue>
                      </p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <InfoRow label="Payment Method">
                    {reg.payment_method?.replace(/_/g, " ") ?? "-"}
                  </InfoRow>
                  <InfoRow label="Paid At">
                    {reg.paid_at ? formatTimestamp(reg.paid_at) : "-"}
                  </InfoRow>
                  <InfoRow label="Invoice">
                    {reg.invoice_id ? (
                      <a
                        href={`/api/invoice/${reg.invoice_id}/pdf?type=invoice`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-blue-600 hover:underline"
                      >
                        {reg.invoice_number}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="font-mono">{reg.invoice_number ?? "-"}</span>
                    )}
                  </InfoRow>
                  <InfoRow label="Receipt">
                    {reg.invoice_id &&
                    (reg.payment_status === "SUCCEEDED" ||
                      reg.payment_status === "PARTIALLY_REFUNDED") ? (
                      <a
                        href={`/api/invoice/${reg.invoice_id}/pdf?type=receipt`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-green-600 hover:underline"
                      >
                        {reg.invoice_number?.replace(/^INV-/, "RCT-")}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="font-mono">
                        {reg.invoice_number
                          ? reg.invoice_number.replace(/^INV-/, "RCT-")
                          : "-"}
                      </span>
                    )}
                  </InfoRow>
                  {stripeUrl && (
                    <InfoRow label="Stripe" className="col-span-2">
                      <a
                        href={stripeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <ExternalLink className="size-3" />
                        View in Stripe Dashboard
                      </a>
                    </InfoRow>
                  )}
                </div>
                {/* Manual payment status + method changers (card excluded) */}
                {isManualPaymentMethod(reg.payment_method) && (
                  <>
                    <ManualPaymentStatusChanger
                      registrationId={reg.id}
                      currentStatus={reg.payment_status}
                      onChanged={onRefresh}
                    />
                    <PaymentMethodChanger
                      registrationId={reg.id}
                      currentMethod={reg.payment_method}
                      onChanged={onRefresh}
                    />
                  </>
                )}
                {/* Self-service card payment link — only for SUBMITTED (Zelle/Check
                    awaiting payment). Lets the registrant switch to card at full price. */}
                {reg.status === "SUBMITTED" && (
                  <div className="mt-3">
                    <CardPaymentLinkButton registrationId={reg.id} />
                  </div>
                )}
                <div className="mt-3">
                  <ResendEmailButton registrationId={reg.id} status={reg.status} />
                </div>
              </section>

              <Separator />

              {/* Contact Information */}
              <section>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <User className="size-4" />
                  Contact Information
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <InfoRow label="Email" icon={Mail}>
                    {reg.registrant_email ?? "-"}
                  </InfoRow>
                  <InfoRow label="Phone" icon={Phone}>
                    {reg.registrant_phone ?? "-"}
                  </InfoRow>
                  <InfoRow label="Church" icon={Church}>
                    {reg.registrant_church ?? "-"}
                  </InfoRow>
                  <InfoRow label="Department" icon={Building2}>
                    {reg.registrant_department ?? "-"}
                  </InfoRow>
                  {reg.registrant_guardian_name && (
                    <InfoRow label="Guardian" icon={ShieldCheck}>
                      {reg.registrant_guardian_name}
                    </InfoRow>
                  )}
                  {reg.registrant_guardian_phone && (
                    <InfoRow label="Guardian Phone" icon={Phone}>
                      {reg.registrant_guardian_phone}
                    </InfoRow>
                  )}
                </div>
              </section>

              <Separator />

              {/* Stay Details (editable) */}
              <StayDetailsSection
                registration={reg}
                registrationGroups={registrationGroups}
                onSaved={onRefresh}
              />

              {/* Room assignments, lodging, preferences, key count per group */}
              {groups.length > 0 && (
                <section>
                  <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
                    <BedDouble className="size-3" />
                    Room &amp; Lodging
                  </h4>
                  <div className="space-y-3">
                    {groups.map((g) => (
                      <div key={g.id} className="space-y-1.5 rounded border p-2.5">
                        <RoomAssignRow
                          group={g}
                          registrationId={reg.id}
                          allRooms={allRooms}
                          onChanged={() => { loadGroups(reg.id); onRefresh(); }}
                        />
                        <LodgingTypeRow
                          group={g}
                          registrationId={reg.id}
                          lodgingOptions={lodgingOptions}
                          onChanged={() => { loadGroups(reg.id); onRefresh(); }}
                        />
                        <GroupPreferencesRow
                          group={g}
                          registrationId={reg.id}
                          onChanged={() => { loadGroups(reg.id); onRefresh(); }}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Airport pickup / drop-off (per participant, editable) */}
              <AirportSection
                registrationId={reg.id}
                eventId={eventId}
                people={people}
              />

              {/* Notes */}
              <Separator />
              <NotesSection
                registrationId={reg.id}
                initialNotes={reg.notes}
                additionalRequests={reg.additional_requests}
                onRefresh={onRefresh}
              />

              <Separator />

              {/* Timestamps */}
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Registered: {formatTimestamp(reg.created_at)}</span>
                <span>Updated: {formatTimestamp(reg.updated_at)}</span>
              </div>
            </TabsContent>

            {/* ─── Participants Tab ─── */}
            <TabsContent value="participants" className="mt-4">
              {loadingPeople ? (
                <p className="text-center text-muted-foreground py-8">
                  Loading participants...
                </p>
              ) : people.length === 0 && transfersOut.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No participants found.
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Representative */}
                  {representative && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Representative
                      </h4>
                      <PersonCard
                        person={representative}
                        registrationId={reg.id}
                        regStartDate={reg.start_date}
                        regEndDate={reg.end_date}
                        eventStartDate={eventDates?.start ?? null}
                        eventEndDate={eventDates?.end ?? null}
                        totalPeople={people.length}
                        allRegistrations={allRegistrations}
                        transferredInFrom={transferredInByMembership.get(representative.membership_id) ?? null}
                        onSaved={() => { loadPeople(reg.id); loadGroups(reg.id); loadTransfers(reg.id); onRefresh(); }}
                        churches={churches}
                        departments={departments}
                      />
                    </div>
                  )}

                  {/* Members */}
                  {members.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Members ({members.length})
                      </h4>
                      <div className="space-y-2">
                        {members.map((p) => (
                          <PersonCard
                            key={p.membership_id}
                            person={p}
                            registrationId={reg.id}
                            regStartDate={reg.start_date}
                            regEndDate={reg.end_date}
                            eventStartDate={eventDates?.start ?? null}
                            eventEndDate={eventDates?.end ?? null}
                            totalPeople={people.length}
                            allRegistrations={allRegistrations}
                            transferredInFrom={transferredInByMembership.get(p.membership_id) ?? null}
                            onSaved={() => { loadPeople(reg.id); loadGroups(reg.id); loadTransfers(reg.id); onRefresh(); }}
                            churches={churches}
                            departments={departments}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Transferred out — tracking records kept for payment reconciliation */}
                  {transfersOut.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <ArrowRightLeft className="size-3" />
                        Transferred Out ({transfersOut.length})
                      </h4>
                      <div className="space-y-2">
                        {transfersOut.map((t) => (
                          <div key={t.id} className="rounded-lg border border-dashed p-3 bg-muted/30">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium text-sm">
                                  {t.first_name_en} {t.last_name_en}
                                  {t.display_name_ko && (
                                    <span className="ml-1.5 text-muted-foreground font-normal">
                                      ({t.display_name_ko})
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Transferred to{" "}
                                  <span className="font-mono text-foreground">
                                    {t.to_confirmation_code ?? "—"}
                                  </span>{" "}
                                  · {formatTimestamp(t.transferred_at)}
                                </p>
                                {t.original_participant_code && (
                                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                    was {t.original_participant_code}
                                    {t.new_participant_code && ` → ${t.new_participant_code}`}
                                  </p>
                                )}
                              </div>
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                tracking
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        These participants were cloned into another registration. Records are kept
                        here so this registration&apos;s original payment can be reconciled.
                      </p>
                    </div>
                  )}

                  {/* Compact table view toggle */}
                  {people.length > 0 && (
                    <>
                      <Separator />
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground active:opacity-70 text-xs transition-colors">
                          Show full table view
                        </summary>
                        <div className="overflow-auto mt-2 rounded border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Display Name</TableHead>
                                <TableHead>Gender</TableHead>
                                <TableHead>DOB</TableHead>
                                <TableHead>Age</TableHead>
                                <TableHead>K-12</TableHead>
                                <TableHead>Group</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>P.Code</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {people.map((p, i) => (
                                <TableRow key={i}>
                                  <TableCell className="whitespace-nowrap font-medium text-sm">
                                    {p.first_name_en} {p.last_name_en}
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {p.display_name_ko ?? "-"}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {p.gender}
                                  </TableCell>
                                  <TableCell className="text-xs whitespace-nowrap">
                                    {p.birth_date ?? "-"}
                                  </TableCell>
                                  <TableCell>{p.age_at_event ?? "-"}</TableCell>
                                  <TableCell>{p.is_k12 ? "Y" : "-"}</TableCell>
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
                            </TableBody>
                          </Table>
                        </div>
                      </details>
                    </>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ─── Adjustments Tab ─── */}
            <TabsContent value="adjustments" className="mt-4">
              <AdjustmentsPanel
                registrationId={reg.id}
                currentAmount={reg.total_amount_cents}
                paymentMethod={reg.payment_method}
                onAdjustmentCreated={() => {
                  // Refresh the table AND the Overview card's refunded total so a
                  // just-processed refund shows up immediately on both tabs.
                  loadRefundedTotal(reg.id);
                  onRefresh();
                }}
              />
            </TabsContent>
          </Tabs>

          {/* ─── Sticky Action Bar ─── */}
          <div className="sticky bottom-0 bg-background border-t pt-4 mt-6 pb-2 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground shrink-0">
                Change status:
              </span>
              <Select
                value=""
                onValueChange={handleStatusChange}
                disabled={updatingStatus}
              >
                <SelectTrigger className="h-8 w-[180px]">
                  <SelectValue placeholder="Select new status..." />
                </SelectTrigger>
                <SelectContent>
                  {VALID_STATUSES.filter((s) => s !== reg.status).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "CANCELLED" || s === "REFUNDED" ? (
                        <span className="text-destructive">{s}</span>
                      ) : (
                        s
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {updatingStatus && (
                <span className="text-xs text-muted-foreground animate-pulse">
                  Updating...
                </span>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialog — rendered for ALL status changes */}
      {confirmAction && (
        <AlertDialog
          open
          onOpenChange={(open) => !open && setConfirmAction(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle
                  className={`size-5 ${
                    confirmAction.status === "CANCELLED" || confirmAction.status === "REFUNDED"
                      ? "text-destructive"
                      : "text-amber-500"
                  }`}
                />
                {confirmAction.label}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Change <strong>{reg.confirmation_code}</strong> ({reg.registrant_name})
                {" "}from <strong>{reg.status}</strong> to{" "}
                <strong>{confirmAction.status}</strong>?
                {confirmAction.status === "CANCELLED" &&
                  " This will deactivate all E-Pass tokens."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={
                  confirmAction.status === "CANCELLED" || confirmAction.status === "REFUNDED"
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/70 active:scale-[0.97]"
                    : ""
                }
                onClick={() => executeStatusChange(confirmAction.status)}
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

// ─── Adjustments Panel ──────────────────────────────────────

interface AdjustmentData {
  id: string;
  adjustment_type: string;
  previous_amount: number;
  new_amount: number;
  difference: number;
  action_taken: string;
  stripe_payment_intent_id: string | null;
  stripe_refund_id: string | null;
  reason: string;
  adjusted_by_name: string;
  created_at: string;
  // Status of the linked custom-charge invoice (gates the receipt link below).
  custom_charge_invoice_status?: string | null;
  metadata?: {
    custom_charge_invoice_id?: string;
    custom_charge_invoice_number?: string;
  } | null;
}

interface AdjustmentSummaryData {
  original_amount: number;
  current_amount: number;
  total_charged: number;
  total_refunded: number;
  total_waived: number;
  total_credited: number;
  net_balance: number;
  pending_count: number;
}

const TYPE_LABELS: Record<string, string> = {
  initial_payment: "Initial Payment",
  date_change: "Date Change",
  option_change: "Option Change",
  discount: "Discount",
  cancellation: "Cancellation",
  admin_correction: "Correction",
};

const ACTION_VARIANTS: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  charge: "default",
  refund: "destructive",
  credit: "secondary",
  waive: "secondary",
  pending: "outline",
};

const ADJUSTMENT_TYPES = [
  { value: "date_change", label: "Date Change" },
  { value: "option_change", label: "Option Change" },
  { value: "discount", label: "Discount" },
  { value: "admin_correction", label: "Admin Correction" },
  { value: "cancellation", label: "Cancellation" },
];

const ACTION_OPTIONS = [
  { value: "refund", label: "Refund" },
  { value: "charge", label: "Charge" },
  { value: "credit", label: "Credit" },
  { value: "waive", label: "Waive" },
  { value: "pending", label: "Pending" },
];

function AdjustmentsPanel({
  registrationId,
  currentAmount,
  paymentMethod,
  onAdjustmentCreated,
}: {
  registrationId: string;
  currentAmount: number;
  paymentMethod: string | null;
  onAdjustmentCreated: () => void;
}) {
  const [adjustments, setAdjustments] = useState<AdjustmentData[]>([]);
  const [summary, setSummary] = useState<AdjustmentSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New adjustment form state
  const [newType, setNewType] = useState("admin_correction");
  const [newAmountDollars, setNewAmountDollars] = useState((currentAmount / 100).toFixed(2));
  const [newAction, setNewAction] = useState("pending");
  const [reason, setReason] = useState("");

  // Process pending state
  const [processingAdj, setProcessingAdj] = useState<AdjustmentData | null>(null);
  const [processAction, setProcessAction] = useState("refund");

  // Edit adjustment state (reason + type only — amount is immutable)
  const [editingAdj, setEditingAdj] = useState<AdjustmentData | null>(null);
  const [editReason, setEditReason] = useState("");
  const [editType, setEditType] = useState("admin_correction");

  const loadAdjustments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/adjustments`);
      if (res.ok) {
        const data = await res.json();
        setAdjustments(data.adjustments ?? []);
        setSummary(data.summary ?? null);
      }
    } catch {
      // silent
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAdjustments();
  }, [registrationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      const localInput = Math.round(parseFloat(newAmountDollars) * 100);
      // refund: registration total drops by the gross refund amount (admin's intent).
      //   API computes the proportional fee and refunds (gross − fee) to the customer.
      // charge: a manual additional amount is ADDED on top of the current total.
      // others (credit/waive/pending/correction): the input IS the new total.
      const apiNewAmount = newAction === "refund"
        ? Math.max(0, currentAmount - localInput)
        : newAction === "charge"
          ? currentAmount + localInput
          : localInput;
      const res = await fetch(`/api/admin/registrations/${registrationId}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adjustment_type: newType,
          new_amount: apiNewAmount,
          action_taken: newAction,
          reason: reason.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.custom_charge_invoice_error) {
          // Charge committed, but the invoice document failed.
          toast.success("Charge recorded");
          toast.error("Invoice could not be generated — check logs");
        } else if (data?.custom_charge_invoice_number) {
          toast.success(
            `Charge billed — awaiting payment (${data.custom_charge_invoice_number})`
          );
        } else {
          toast.success("Adjustment created");
        }
        setShowNewDialog(false);
        setReason("");
        setNewType("admin_correction");
        setNewAmountDollars((currentAmount / 100).toFixed(2));
        setNewAction("pending");
        await loadAdjustments();
        onAdjustmentCreated();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create adjustment");
      }
    } catch {
      toast.error("Failed to create adjustment");
    }
    setSubmitting(false);
  };

  const handleProcess = async () => {
    if (!processingAdj) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/registrations/${registrationId}/adjustments/${processingAdj.id}/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: processAction }),
        }
      );
      if (res.ok) {
        toast.success(`Adjustment processed: ${processAction}`);
        setProcessingAdj(null);
        await loadAdjustments();
        onAdjustmentCreated();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to process adjustment");
      }
    } catch {
      toast.error("Failed to process adjustment");
    }
    setSubmitting(false);
  };

  const openEdit = (adj: AdjustmentData) => {
    setEditingAdj(adj);
    setEditReason(adj.reason);
    setEditType(
      ADJUSTMENT_TYPES.some((t) => t.value === adj.adjustment_type)
        ? adj.adjustment_type
        : "admin_correction"
    );
  };

  const handleEdit = async () => {
    if (!editingAdj || !editReason.trim()) return;
    setSubmitting(true);
    try {
      // The system-generated initial payment keeps its type; only the reason changes.
      const isInitial = editingAdj.adjustment_type === "initial_payment";
      const res = await fetch(
        `/api/admin/registrations/${registrationId}/adjustments/${editingAdj.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: editReason.trim(),
            ...(isInitial ? {} : { adjustment_type: editType }),
          }),
        }
      );
      if (res.ok) {
        toast.success("Adjustment updated");
        setEditingAdj(null);
        await loadAdjustments();
        onAdjustmentCreated();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to update adjustment");
      }
    } catch {
      toast.error("Failed to update adjustment");
    }
    setSubmitting(false);
  };

  const inputCents = Math.round(parseFloat(newAmountDollars) * 100) || 0;
  const isRefundAction = newAction === "refund";
  // Charge takes a manual additional amount to ADD on top of the current total
  // (mirrors how refund takes an amount to subtract), not an absolute new total.
  const isChargeAction = newAction === "charge";
  // Zelle/Check/On-Site/Manual: no Stripe call, no processing fee. Label the
  // refund generically so the UI doesn't claim a Stripe refund that won't happen.
  const isManualMethod = isManualPaymentMethod(paymentMethod);
  const refundLabel = isManualMethod ? "Refund" : "Stripe refund";

  // Refund limit: processing fee is non-refundable
  const feeBase = summary && summary.original_amount > 0 ? summary.original_amount : currentAmount;
  const processingFee = feeBase > 0 ? calculateProcessingFee(feeBase, paymentMethod) : 0;
  const maxRefundTotal = feeBase - processingFee;
  const availableRefund = summary ? Math.max(0, maxRefundTotal - summary.total_refunded) : 0;
  // Proportional fee withheld from THIS refund — Stripe doesn't refund fees on partials,
  // so the church holds back the fee share of the refunded portion. The customer pays it.
  const proportionalRefundFee = isRefundAction && inputCents > 0
    ? calculateProportionalProcessingFee(inputCents, feeBase, paymentMethod)
    : 0;
  // What the customer actually receives via Stripe: gross intent − proportional fee,
  // capped at remaining refundable balance.
  const stripeRefund = isRefundAction
    ? Math.max(0, Math.min(inputCents - proportionalRefundFee, availableRefund))
    : 0;
  // Registration total reflects admin's intent — drops by the GROSS refund amount.
  // (Customer-received refund differs by the withheld fee; tracked separately in eckcm_refunds.)
  // Charge ADDS the manual amount to the current total; everything else IS the new total.
  const newAmountCents = isRefundAction
    ? Math.max(0, currentAmount - inputCents)
    : isChargeAction
      ? currentAmount + inputCents
      : inputCents;
  const diff = newAmountCents - currentAmount;
  const refundExceedsTotal = isRefundAction && inputCents > currentAmount;
  // Minimum: customer must receive at least $1 (Stripe's own floor is ~$0.50;
  // the extra leeway protects against micro-refund noise). Only flag when admin
  // has actually started typing — empty/zero shouldn't show a "below min" error.
  const refundBelowMinimum =
    isRefundAction && inputCents > 0 && stripeRefund > 0 && stripeRefund < MIN_REFUND_CENTS;

  if (loading) {
    return (
      <p className="text-center text-muted-foreground py-8">
        Loading adjustments...
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      {summary && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg border p-2.5 text-center">
              <p className="text-base font-bold">{formatMoney(summary.original_amount)}</p>
              <p className="text-[10px] text-muted-foreground">Original</p>
            </div>
            <div className="rounded-lg border p-2.5 text-center">
              <p className="text-base font-bold">{formatMoney(summary.current_amount)}</p>
              <p className="text-[10px] text-muted-foreground">Current</p>
            </div>
            <div className="rounded-lg border p-2.5 text-center">
              <p className="text-base font-bold text-green-600">{formatMoney(summary.total_charged)}</p>
              <p className="text-[10px] text-muted-foreground">Charged</p>
            </div>
            <div className="rounded-lg border p-2.5 text-center">
              <p className="text-base font-bold text-red-600">{formatMoney(summary.total_refunded)}</p>
              <p className="text-[10px] text-muted-foreground">Refunded</p>
            </div>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground px-1">
            <div className="flex justify-between">
              <span>Net Balance: <strong className="text-foreground">{formatMoney(summary.net_balance)}</strong></span>
              {summary.pending_count > 0 && (
                <span className="text-amber-600">Pending: {summary.pending_count}</span>
              )}
            </div>
            {processingFee > 0 && (
              <>
                <div className="flex justify-between">
                  <span>Processing Fee ({paymentMethod?.replace(/_/g, " ")}): <strong className="text-foreground">{formatMoney(processingFee)}</strong></span>
                  <span>Max Refund: <strong className="text-foreground">{formatMoney(maxRefundTotal)}</strong></span>
                </div>
                {summary.total_refunded > 0 && (
                  <div className="flex justify-between">
                    <span>Refunded: <strong className="text-foreground">{formatMoney(summary.total_refunded)}</strong></span>
                    <span>Available: <strong className={availableRefund <= 0 ? "text-destructive" : "text-foreground"}>{formatMoney(availableRefund)}</strong></span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* New Adjustment Button */}
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          // Charge enters an amount to ADD (start empty); all others prefill the total.
          setNewAmountDollars(newAction === "charge" ? "0.00" : (currentAmount / 100).toFixed(2));
          setShowNewDialog(true);
        }}
        className="w-full"
      >
        <Plus className="size-3.5 mr-1.5" />
        New Adjustment
      </Button>

      {/* Ledger Table */}
      {adjustments.length === 0 ? (
        <p className="text-center text-muted-foreground py-4 text-sm">
          No adjustments recorded yet.
        </p>
      ) : (
        <div className="overflow-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs text-right">Diff</TableHead>
                <TableHead className="text-xs">Action</TableHead>
                <TableHead className="text-xs">Reason</TableHead>
                <TableHead className="text-xs">By</TableHead>
                <TableHead className="text-xs w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustments.map((adj) => (
                <TableRow key={adj.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {formatTimestamp(adj.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {TYPE_LABELS[adj.adjustment_type] ?? adj.adjustment_type}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`text-xs text-right font-mono ${
                      adj.difference > 0
                        ? "text-green-600"
                        : adj.difference < 0
                          ? "text-red-600"
                          : ""
                    }`}
                  >
                    {adj.difference >= 0 ? "+" : ""}
                    {formatMoney(adj.difference)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={ACTION_VARIANTS[adj.action_taken] ?? "secondary"}
                      className="text-[10px]"
                    >
                      {adj.action_taken}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs truncate max-w-[120px]" title={adj.reason}>
                    {adj.reason}
                  </TableCell>
                  <TableCell className="text-xs truncate max-w-[80px]">
                    {adj.adjusted_by_name}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {adj.adjustment_type !== "initial_payment" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          title="Edit reason / type"
                          onClick={() => openEdit(adj)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                      )}
                      {adj.action_taken === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] px-2"
                          onClick={() => {
                            setProcessingAdj(adj);
                            setProcessAction(adj.difference < 0 ? "refund" : "charge");
                          }}
                        >
                          Process
                        </Button>
                      )}
                    </div>
                    {/* Custom-charge invoice (always) + receipt (only once the
                        charge invoice is paid — receipts don't exist while pending). */}
                    {adj.metadata?.custom_charge_invoice_id && (
                      <div className="flex items-center gap-2 mt-1">
                        <a
                          href={`/api/invoice/${adj.metadata.custom_charge_invoice_id}/pdf?type=invoice`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline"
                          title="Custom charge invoice"
                        >
                          <FileText className="size-3" /> Inv
                        </a>
                        {adj.custom_charge_invoice_status === "SUCCEEDED" && (
                          <a
                            href={`/api/invoice/${adj.metadata.custom_charge_invoice_id}/pdf?type=receipt`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[10px] text-green-600 hover:underline"
                            title="Custom charge receipt"
                          >
                            <FileText className="size-3" /> Rct
                          </a>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* New Adjustment Dialog */}
      <AlertDialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New Adjustment</AlertDialogTitle>
            <AlertDialogDescription>
              Create a price adjustment for this registration.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Type</label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">
                {isRefundAction
                  ? "Refund Amount ($)"
                  : isChargeAction
                    ? "Additional Charge ($)"
                    : "New Total ($)"}
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={newAmountDollars}
                  onChange={(e) => setNewAmountDollars(e.target.value)}
                  className="pl-7"
                />
              </div>
              {isRefundAction ? (
                <div className="text-xs mt-1 space-y-0.5">
                  <p className="text-muted-foreground">
                    New Total: {formatMoney(Math.max(0, newAmountCents))}
                    {inputCents > 0 && (
                      <> · {refundLabel}: {formatMoney(stripeRefund)}
                        {proportionalRefundFee > 0 && (
                          <> (fee {formatMoney(proportionalRefundFee)} withheld)</>
                        )}
                      </>
                    )}
                  </p>
                  {availableRefund <= 0 && (
                    <p className="text-destructive">
                      No refundable amount remaining (fee {formatMoney(processingFee)} already exceeds balance)
                    </p>
                  )}
                  {refundExceedsTotal && (
                    <p className="text-destructive">
                      Cannot refund more than current amount ({formatMoney(currentAmount)})
                    </p>
                  )}
                  {refundBelowMinimum && !refundExceedsTotal && (
                    <p className="text-destructive">
                      Minimum refund: {formatMoney(MIN_REFUND_CENTS)} to customer
                      {proportionalRefundFee > 0 && (
                        <> (fee {formatMoney(proportionalRefundFee)} is withheld — type a bit more)</>
                      )}
                    </p>
                  )}
                </div>
              ) : isChargeAction ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Current: {formatMoney(currentAmount)}
                  {" · "}
                  New Total:{" "}
                  <span className="font-medium text-foreground">
                    {formatMoney(newAmountCents)}
                  </span>
                  {inputCents > 0 && (
                    <span className="text-green-600"> (+{formatMoney(inputCents)})</span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  Current: {formatMoney(currentAmount)}
                  {" · "}
                  Difference:{" "}
                  <span className={diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : ""}>
                    {diff >= 0 ? "+" : ""}{formatMoney(diff)}
                  </span>
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Action</label>
              <Select value={newAction} onValueChange={(val) => {
                const prev = newAction;
                setNewAction(val);
                if (val === "refund") {
                  // Auto-fill with the current registration total — admin's intent
                  // for a "full refund". Fee is deducted from the actual Stripe refund
                  // (shown beneath the input), not from this intent value.
                  setNewAmountDollars((currentAmount / 100).toFixed(2));
                } else if (val === "charge") {
                  // Charge takes a manual amount to ADD, not a total — start empty.
                  setNewAmountDollars("0.00");
                } else if (prev === "refund" || prev === "charge") {
                  // Switching from an incremental action back to a "new total" action.
                  setNewAmountDollars((currentAmount / 100).toFixed(2));
                }
              }}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Reason *</label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this adjustment is being made..."
                className="mt-1"
                rows={2}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCreate}
              disabled={!reason.trim() || submitting || refundExceedsTotal || refundBelowMinimum || (isRefundAction && availableRefund <= 0) || (isChargeAction && inputCents <= 0)}
            >
              {submitting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Confirm Adjustment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Adjustment Dialog */}
      {editingAdj && (
        <AlertDialog open onOpenChange={(open) => !open && setEditingAdj(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Edit Adjustment</AlertDialogTitle>
              <AlertDialogDescription>
                Update the reason and type. The amount ({formatMoney(editingAdj.difference)})
                and action ({editingAdj.action_taken}) can&apos;t be changed — create a new
                adjustment to correct an amount.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-4">
              {editingAdj.adjustment_type !== "initial_payment" && (
                <div>
                  <label className="text-sm font-medium">Type</label>
                  <Select value={editType} onValueChange={setEditType}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ADJUSTMENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">Reason *</label>
                <Textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Explain this adjustment..."
                  className="mt-1"
                  rows={2}
                />
                {editingAdj.metadata?.custom_charge_invoice_id && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Also updates the linked custom-charge invoice
                    {editingAdj.metadata.custom_charge_invoice_number
                      ? ` (${editingAdj.metadata.custom_charge_invoice_number})`
                      : ""}.
                  </p>
                )}
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleEdit}
                disabled={!editReason.trim() || submitting}
              >
                {submitting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                Save
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Process Pending Dialog */}
      {processingAdj && (
        <AlertDialog open onOpenChange={(open) => !open && setProcessingAdj(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Process Pending Adjustment</AlertDialogTitle>
              <AlertDialogDescription>
                {TYPE_LABELS[processingAdj.adjustment_type] ?? processingAdj.adjustment_type}
                {" · "}
                {processingAdj.difference >= 0 ? "+" : ""}
                {formatMoney(processingAdj.difference)}
                <br />
                <span className="text-xs">{processingAdj.reason}</span>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div>
              <label className="text-sm font-medium">Action</label>
              <Select value={processAction} onValueChange={setProcessAction}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="refund">Refund</SelectItem>
                  <SelectItem value="charge">Charge</SelectItem>
                  <SelectItem value="waive">Waive</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
              {processAction === "refund" && processingAdj && (() => {
                // adj.difference is the customer-received amount for new-style
                // adjustments (UI deducted the fee at creation time). Cap for safety.
                const rawRefund = Math.abs(processingAdj.difference);
                const actual = Math.max(0, Math.min(rawRefund, availableRefund));
                return (
                  <p className="text-xs mt-1.5 text-muted-foreground">
                    {refundLabel}: {formatMoney(actual)}
                  </p>
                );
              })()}
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleProcess} disabled={submitting}>
                {submitting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                Process
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ─── Stay Dates + Meals (per participant, editable) ─────────
// Reuses MealSelectionGrid from the registration wizard so admin and user
// see the exact same grid — same arrival/departure exclusion, same partial
// vs full-day rules, same default-all-checked behavior.

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function StayAndMealsEditor({
  person,
  registrationId,
  regStartDate,
  regEndDate,
  eventStartDate,
  eventEndDate,
  onSaved,
}: {
  person: PersonDetail;
  registrationId: string;
  regStartDate: string;
  regEndDate: string;
  eventStartDate: string | null;
  eventEndDate: string | null;
  onSaved: () => void;
}) {
  const hasOverride = !!(person.stay_start_date && person.stay_end_date);
  const effectiveStart = person.stay_start_date ?? regStartDate;
  const effectiveEnd = person.stay_end_date ?? regEndDate;

  // ─── Stay dates editor state ─────────────────────────────
  const [editingDates, setEditingDates] = useState(false);
  const [savingDates, setSavingDates] = useState(false);
  const [useOverride, setUseOverride] = useState(hasOverride);
  const [draftStart, setDraftStart] = useState(effectiveStart);
  const [draftEnd, setDraftEnd] = useState(effectiveEnd);

  useEffect(() => {
    setEditingDates(false);
    setUseOverride(hasOverride);
    setDraftStart(effectiveStart);
    setDraftEnd(effectiveEnd);
  }, [person.membership_id, person.stay_start_date, person.stay_end_date, effectiveStart, effectiveEnd, hasOverride]);

  const handleSaveDates = async () => {
    if (useOverride && new Date(draftEnd) < new Date(draftStart)) {
      toast.error("Check-out must be on or after check-in");
      return;
    }
    setSavingDates(true);
    try {
      const res = await fetch(
        `/api/admin/registrations/${registrationId}/participants/${person.membership_id}/stay-dates`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            useOverride
              ? { stay_start_date: draftStart, stay_end_date: draftEnd }
              : { stay_start_date: null, stay_end_date: null },
          ),
        },
      );
      if (res.ok) {
        toast.success("Stay dates saved");
        setEditingDates(false);
        onSaved();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save stay dates");
      }
    } catch {
      toast.error("Failed to save stay dates");
    }
    setSavingDates(false);
  };

  // ─── Meals editor state ──────────────────────────────────
  // Convert DB rows to MealSelection[] preserving each row's is_selected so
  // admin "unchecked" state survives. Absence of any rows is treated as
  // "uninitialized" — the grid fills it with defaults (all selected).
  const dbToSelections = (rows: { meal_date: string; meal_type: string; is_selected: boolean }[]): MealSelection[] =>
    rows.map((r) => ({ date: r.meal_date, mealType: r.meal_type as MealType, selected: r.is_selected }));

  const initialSelections = dbToSelections(person.meal_selections);
  const [mealSelections, setMealSelections] = useState<MealSelection[]>(initialSelections);
  const [savingMeals, setSavingMeals] = useState(false);
  const [editingMeals, setEditingMeals] = useState(false);

  useEffect(() => {
    setMealSelections(dbToSelections(person.meal_selections));
    setEditingMeals(false);
  }, [person.membership_id, person.meal_selections]);

  const handleMealsChange = (next: MealSelection[]) => {
    setMealSelections(next);
  };

  // Dirty = the set of *selected* meals differs from what DB has selected.
  // Both sides treat absence as "not selected" when comparing, so the
  // grid's initial auto-fill of defaults shows as dirty for pre-fix
  // registrations (admin can Save to commit those defaults).
  const selectedKeySet = (rows: { date?: string; meal_date?: string; mealType?: string; meal_type?: string; selected?: boolean; is_selected?: boolean }[]) => {
    const out = new Set<string>();
    for (const r of rows) {
      const date = r.date ?? r.meal_date;
      const type = r.mealType ?? r.meal_type;
      const sel = r.selected ?? r.is_selected;
      if (date && type && sel) out.add(`${date}|${type}`);
    }
    return out;
  };
  const currentSet = selectedKeySet(mealSelections);
  const dbSet = selectedKeySet(person.meal_selections);
  const dirty = currentSet.size !== dbSet.size || [...currentSet].some((k) => !dbSet.has(k));

  const handleSaveMeals = async () => {
    // Send the full grid (both selected and not). Storing unselected rows
    // lets admin opt-outs survive a reload — see API doc comment.
    const selections = mealSelections.map((s) => ({
      meal_date: s.date,
      meal_type: s.mealType,
      is_selected: s.selected,
    }));
    setSavingMeals(true);
    try {
      const res = await fetch(
        `/api/admin/registrations/${registrationId}/participants/${person.membership_id}/meals`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selections }),
        },
      );
      if (res.ok) {
        const selectedCount = selections.filter((s) => s.is_selected).length;
        toast.success(`Saved ${selectedCount} meal(s) for ${person.first_name_en}`);
        setEditingMeals(false);
        onSaved();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save meals");
      }
    } catch {
      toast.error("Failed to save meals");
    }
    setSavingMeals(false);
  };

  const handleCancelMeals = () => {
    setMealSelections(dbToSelections(person.meal_selections));
    setEditingMeals(false);
  };

  const eventReady = !!(eventStartDate && eventEndDate);

  return (
    <div className="mt-3 pt-3 border-t space-y-3">
      {/* Stay dates row */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Stay Dates</span>
          {!hasOverride && !editingDates && (
            <span className="text-[10px] text-muted-foreground">(using registration default)</span>
          )}
          {!editingDates && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs ml-auto" onClick={() => setEditingDates(true)}>
              <Pencil className="size-3 mr-1" />
              Edit
            </Button>
          )}
        </div>
        {editingDates ? (
          <div className="space-y-2 pl-5">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={useOverride}
                onChange={(e) => setUseOverride(e.target.checked)}
              />
              Override registration dates for this participant
            </label>
            {useOverride && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <label className="text-[10px] text-muted-foreground">Check-in</label>
                  <Input type="date" value={draftStart} onChange={(e) => setDraftStart(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] text-muted-foreground">Check-out</label>
                  <Input type="date" value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              Changing dates does not recalculate fees. Use the Adjustments tab for any monetary delta.
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" className="h-7 px-2" onClick={handleSaveDates} disabled={savingDates}>
                {savingDates ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Save className="size-3 mr-1" />}
                Save
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => {
                setUseOverride(hasOverride);
                setDraftStart(effectiveStart);
                setDraftEnd(effectiveEnd);
                setEditingDates(false);
              }}>
                <X className="size-3" />
              </Button>
            </div>
          </div>
        ) : (
          <p className="pl-5 text-xs text-muted-foreground">
            {formatShortDate(effectiveStart)} ~ {formatShortDate(effectiveEnd)}
          </p>
        )}
      </div>

      {/* Meals grid (same component used in the registration wizard) */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <FileText className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Meals</span>
          {!editingMeals && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs ml-auto"
              onClick={() => setEditingMeals(true)}
              disabled={!eventReady}
            >
              <Pencil className="size-3 mr-1" />
              Edit
            </Button>
          )}
        </div>
        {!eventReady ? (
          <p className="text-xs text-muted-foreground italic">Loading event dates…</p>
        ) : (
          <>
            <MealSelectionGrid
              startDate={effectiveStart}
              endDate={effectiveEnd}
              eventStartDate={eventStartDate!}
              eventEndDate={eventEndDate!}
              selections={mealSelections}
              onChange={handleMealsChange}
              adminOverride
              readOnly={!editingMeals}
            />
            {editingMeals && (
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-muted-foreground">
                  Admin can toggle any meal (including full-day). Saving does not recalculate fees — record monetary deltas in Adjustments.
                </p>
                <div className="ml-auto flex gap-1.5">
                  <Button size="sm" className="h-7 px-2" onClick={handleSaveMeals} disabled={savingMeals || !dirty}>
                    {savingMeals ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Save className="size-3 mr-1" />}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleCancelMeals}>
                    <X className="size-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Resend Email Button ────────────────────────────────────

function CardPaymentLinkButton({ registrationId }: { registrationId: string }) {
  // null = unknown/none, string = an active link already exists.
  const [url, setUrl] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState(false);

  // On mount, check whether a payment link already exists so the admin can see
  // its state instead of blindly (re)generating.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/registrations/${registrationId}/payment-link`
        );
        const data = await res.json().catch(() => ({}));
        if (active && res.ok && data.exists && data.url) setUrl(data.url);
      } catch {
        /* non-fatal — admin can still generate */
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [registrationId]);

  // Generates a link, or — because the backend reuses the existing token —
  // returns the same link if one was already created. Never mints a duplicate.
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(
        `/api/admin/registrations/${registrationId}/payment-link`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create payment link");
      setUrl(data.url);
      setOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create payment link");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const busy = checking || generating;

  return (
    <>
      {url ? (
        // A link already exists — show its state and let the admin view/copy it.
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={generating}
        >
          <Link2 className="size-3" />
          Payment Link
          <span className="ml-1.5 inline-flex items-center gap-1 text-emerald-600">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Active
          </span>
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={handleGenerate} disabled={busy}>
          {busy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <CreditCard className="size-3" />
          )}
          Create Payment Link
        </Button>
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Card Payment Link</AlertDialogTitle>
            <AlertDialogDescription>
              Send this link to the registrant. They can pay by card without
              logging in. The registration is marked PAID automatically once
              payment completes, and the card list price is charged (manual-payment
              discount excluded).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={url ?? ""}
              className="font-mono text-xs"
              onFocus={(e) => e.target.select()}
            />
            <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="size-3" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This is a single reusable link — re-generating returns the same link,
            not a new one. Once the registration is paid, opening it shows
            &ldquo;already paid.&rdquo;
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type ResendEmailType = "confirmation" | "receipt" | "epass" | "payment-link";

function ResendEmailButton({
  registrationId,
  status,
}: {
  registrationId: string;
  status: string;
}) {
  const [sending, setSending] = useState<null | ResendEmailType>(null);

  const handleSend = async (type: ResendEmailType) => {
    setSending(type);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/resend-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to resend email");
      } else if (type === "epass") {
        const { sent = 0, skipped = 0, failed = 0 } = data;
        if (sent === 0 && failed === 0) {
          toast.warning(`No ePass emails sent — ${skipped} participant(s) without email.`);
        } else {
          toast.success(`Sent ${sent} ePass email(s)${skipped ? `, skipped ${skipped}` : ""}${failed ? `, failed ${failed}` : ""}`);
        }
      } else if (type === "payment-link") {
        toast.success(data.to ? `Card payment link emailed to ${data.to}` : "Card payment link emailed");
      } else {
        toast.success(type === "receipt" ? "Receipt email resent" : "Confirmation email resent");
      }
    } catch {
      toast.error("Failed to resend email");
    }
    setSending(null);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={sending !== null}>
          {sending ? (
            <Loader2 className="size-3.5 mr-1.5 animate-spin" />
          ) : (
            <Send className="size-3.5 mr-1.5" />
          )}
          Resend Email
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => handleSend("confirmation")} disabled={sending !== null}>
          <Mail className="size-3.5 mr-2" />
          Registration confirmation
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSend("receipt")} disabled={sending !== null}>
          <FileText className="size-3.5 mr-2" />
          Payment receipt
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSend("epass")} disabled={sending !== null}>
          <ShieldCheck className="size-3.5 mr-2" />
          ePass (per participant)
        </DropdownMenuItem>
        {/* Card payment link email — only meaningful while awaiting payment. */}
        {status === "SUBMITTED" && (
          <DropdownMenuItem onClick={() => handleSend("payment-link")} disabled={sending !== null}>
            <CreditCard className="size-3.5 mr-2" />
            Card payment link
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Airport Pickup / Drop-off Section (per participant) ────

interface AirportRideRow {
  id: string;
  direction: "PICKUP" | "DROPOFF";
  scheduled_at: string;
  label: string | null;
  origin: string | null;
  destination: string | null;
}

function AirportSection({
  registrationId,
  eventId,
  people,
}: {
  registrationId: string;
  eventId: string;
  people: PersonDetail[];
}) {
  const [rides, setRides] = useState<AirportRideRow[]>([]);
  // key `${rideId}:${personId}` → flight_info. Presence in the map === assigned.
  const [assignMap, setAssignMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<{
    ride: AirportRideRow;
    personId: string;
    personName: string;
    next: boolean;
  } | null>(null);

  const rideKey = (rideId: string, personId: string) => `${rideId}:${personId}`;

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [{ data: rideRows }, { data: assignRows }] = await Promise.all([
      supabase
        .from("eckcm_airport_rides")
        .select("id, direction, scheduled_at, label, origin, destination")
        .eq("event_id", eventId)
        .eq("is_active", true)
        .order("scheduled_at"),
      supabase
        .from("eckcm_registration_rides")
        .select("ride_id, person_id, flight_info")
        .eq("registration_id", registrationId),
    ]);
    setRides((rideRows as AirportRideRow[]) ?? []);
    const map = new Map<string, string>();
    for (const a of (assignRows ?? []) as {
      ride_id: string;
      person_id: string | null;
      flight_info: string | null;
    }[]) {
      if (a.person_id) map.set(rideKey(a.ride_id, a.person_id), a.flight_info ?? "");
    }
    setAssignMap(map);
    setLoading(false);
  }, [eventId, registrationId]);

  useEffect(() => {
    load();
  }, [load]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    });

  const dirLabel = (d: "PICKUP" | "DROPOFF") =>
    d === "PICKUP" ? "pickup" : "drop-off";

  // Toggle is confirmed via the warning dialog before it hits the API.
  const applyToggle = async () => {
    if (!pending) return;
    const { ride, personId, next } = pending;
    const key = rideKey(ride.id, personId);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/registrations/${registrationId}/airport`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personId, rideId: ride.id, assigned: next }),
        }
      );
      if (res.ok) {
        setAssignMap((prev) => {
          const n = new Map(prev);
          if (next) n.set(key, "");
          else n.delete(key);
          return n;
        });
        setPending(null);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to update airport assignment");
      }
    } catch {
      toast.error("Failed to update airport assignment");
    }
    setSubmitting(false);
  };

  const saveFlight = async (rideId: string, personId: string, value: string) => {
    const key = rideKey(rideId, personId);
    try {
      const res = await fetch(
        `/api/admin/registrations/${registrationId}/airport`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personId, rideId, flightInfo: value }),
        }
      );
      if (res.ok) {
        setAssignMap((prev) => {
          const n = new Map(prev);
          n.set(key, value);
          return n;
        });
        toast.success("Flight info saved");
        return true;
      }
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save flight info");
      return false;
    } catch {
      toast.error("Failed to save flight info");
      return false;
    }
  };

  // No rides configured for this event → nothing to assign.
  if (!loading && rides.length === 0) return null;

  const pickups = rides.filter((r) => r.direction === "PICKUP");
  const dropoffs = rides.filter((r) => r.direction === "DROPOFF");

  const renderRide = (ride: AirportRideRow) => {
    const count = people.reduce(
      (n, p) => n + (assignMap.has(rideKey(ride.id, p.person_id)) ? 1 : 0),
      0
    );
    return (
      <div key={ride.id} className="rounded border p-2.5 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          {ride.direction === "PICKUP" ? (
            <PlaneLanding className="size-3.5 text-muted-foreground shrink-0" />
          ) : (
            <PlaneTakeoff className="size-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="font-medium">{fmt(ride.scheduled_at)}</span>
          {(ride.origin || ride.destination) && (
            <span className="text-muted-foreground truncate">
              {ride.origin ?? "—"} → {ride.destination ?? "—"}
            </span>
          )}
          <span className="ml-auto text-muted-foreground shrink-0">
            {count}/{people.length}
          </span>
        </div>
        <div className="space-y-1.5">
          {people.map((p) => {
            const key = rideKey(ride.id, p.person_id);
            const isAssigned = assignMap.has(key);
            return (
              <RidePassengerRow
                key={p.membership_id}
                person={p}
                assigned={isAssigned}
                flightInfo={assignMap.get(key) ?? ""}
                onToggle={() =>
                  setPending({
                    ride,
                    personId: p.person_id,
                    personName: `${p.first_name_en} ${p.last_name_en}`,
                    next: !isAssigned,
                  })
                }
                onSaveFlight={(value) => saveFlight(ride.id, p.person_id, value)}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      <section>
        <h3 className="text-sm font-semibold mb-3">Airport</h3>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading rides…</p>
        ) : (
          <div className="space-y-3">
            {pickups.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Pickup</p>
                {pickups.map(renderRide)}
              </div>
            )}
            {dropoffs.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  Drop-off
                </p>
                {dropoffs.map(renderRide)}
              </div>
            )}
          </div>
        )}
      </section>

      {pending && (
        <AlertDialog
          open
          onOpenChange={(open) => !open && !submitting && setPending(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle
                  className={`size-5 ${
                    pending.next ? "text-amber-500" : "text-destructive"
                  }`}
                />
                {pending.next ? "Add to airport ride" : "Remove from airport ride"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pending.next ? (
                  <>
                    Assign <strong>{pending.personName}</strong> to the{" "}
                    {dirLabel(pending.ride.direction)} ride on{" "}
                    <strong>{fmt(pending.ride.scheduled_at)}</strong>?
                  </>
                ) : (
                  <>
                    Remove <strong>{pending.personName}</strong> from the{" "}
                    {dirLabel(pending.ride.direction)} ride on{" "}
                    <strong>{fmt(pending.ride.scheduled_at)}</strong>? Their flight
                    info for this ride will be removed too.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={
                  pending.next
                    ? ""
                    : "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/70 active:scale-[0.97]"
                }
                onClick={(e) => {
                  e.preventDefault();
                  applyToggle();
                }}
                disabled={submitting}
              >
                {submitting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

// ─── Airport passenger row (checkbox + editable flight info) ──

function RidePassengerRow({
  person,
  assigned,
  flightInfo,
  onToggle,
  onSaveFlight,
}: {
  person: PersonDetail;
  assigned: boolean;
  flightInfo: string;
  onToggle: () => void;
  onSaveFlight: (value: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(flightInfo);
  const [saving, setSaving] = useState(false);

  // Re-sync when the saved value changes (assign/unassign/reload).
  useEffect(() => {
    setDraft(flightInfo);
  }, [flightInfo, assigned]);

  const dirty = draft !== flightInfo;

  const handleSave = async () => {
    setSaving(true);
    await onSaveFlight(draft);
    setSaving(false);
  };

  return (
    <div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Checkbox checked={assigned} onCheckedChange={onToggle} />
        <span>
          {person.first_name_en} {person.last_name_en}
          {person.display_name_ko ? (
            <span className="text-muted-foreground">
              {" "}
              ({person.display_name_ko})
            </span>
          ) : null}
        </span>
      </label>
      {assigned && (
        <div className="mt-1 ml-6 space-y-1">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Flight info (airline, flight #, arrival time)…"
            className="text-xs"
          />
          {dirty && (
            <div className="flex justify-end">
              <Button
                size="sm"
                className="h-7 px-2"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="size-3 mr-1 animate-spin" />
                ) : (
                  <Save className="size-3 mr-1" />
                )}
                Save
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Check-in / Check-out Section (editable) ────────────────

type CheckinActionKey = "check_in" | "uncheck_in" | "check_out" | "uncheck_out";

const CHECKIN_ACTIONS: Record<
  CheckinActionKey,
  {
    title: string;
    toast: string;
    describe: (code: string, count: number) => string;
    destructive: boolean;
  }
> = {
  check_in: {
    title: "Check in registration",
    toast: "Checked in",
    describe: (code, n) =>
      `Mark ${code} as checked in? This checks in all ${n} participant(s).`,
    destructive: false,
  },
  uncheck_in: {
    title: "Undo check-in",
    toast: "Check-in removed",
    describe: (code, n) =>
      `Remove check-in for ${code}? This clears check-in for all ${n} participant(s) — and also clears any check-out.`,
    destructive: true,
  },
  check_out: {
    title: "Check out registration",
    toast: "Checked out",
    describe: (code, n) =>
      `Mark ${code} as checked out? This checks out all ${n} participant(s).`,
    destructive: false,
  },
  uncheck_out: {
    title: "Undo check-out",
    toast: "Check-out removed",
    describe: (code) =>
      `Undo check-out for ${code}? Participants stay checked in.`,
    destructive: true,
  },
};

function CheckinSection({
  registration,
  onChanged,
}: {
  registration: RegistrationRow;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<CheckinActionKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The parent's detailReg is a snapshot — onChanged() refreshes the table but
  // not these props until the sheet is reopened. Keep local state so the
  // checkboxes reflect the change immediately, re-syncing if the prop changes.
  const [checkedIn, setCheckedIn] = useState(registration.checked_in);
  const [checkedOut, setCheckedOut] = useState(registration.checked_out);
  useEffect(() => {
    setCheckedIn(registration.checked_in);
    setCheckedOut(registration.checked_out);
  }, [registration.id, registration.checked_in, registration.checked_out]);

  const apply = async (action: CheckinActionKey) => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/registrations/${registration.id}/checkin`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      if (res.ok) {
        toast.success(CHECKIN_ACTIONS[action].toast);
        // Optimistically reflect the new state in the open sheet.
        if (action === "check_in") setCheckedIn(true);
        else if (action === "uncheck_in") {
          setCheckedIn(false);
          setCheckedOut(false);
        } else if (action === "check_out") {
          setCheckedIn(true);
          setCheckedOut(true);
        } else if (action === "uncheck_out") setCheckedOut(false);
        setPending(null);
        onChanged();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to update check-in");
      }
    } catch {
      toast.error("Failed to update check-in");
    }
    setSubmitting(false);
  };

  return (
    <section>
      <h3 className="text-sm font-semibold mb-3">Check-in / Check-out</h3>
      <div className="space-y-2.5">
        <label className="flex items-center gap-2.5 text-sm cursor-pointer">
          <Checkbox
            checked={checkedIn}
            disabled={submitting}
            onCheckedChange={(v) => setPending(v ? "check_in" : "uncheck_in")}
          />
          <span>Checked In</span>
          {checkedIn && (
            <Badge variant="default" className="text-[10px] ml-auto">
              Checked In
            </Badge>
          )}
        </label>
        <label
          className={`flex items-center gap-2.5 text-sm ${
            checkedIn ? "cursor-pointer" : "opacity-50 cursor-not-allowed"
          }`}
        >
          <Checkbox
            checked={checkedOut}
            disabled={submitting || !checkedIn}
            onCheckedChange={(v) => setPending(v ? "check_out" : "uncheck_out")}
          />
          <span>Checked Out</span>
          {checkedOut && (
            <Badge variant="default" className="text-[10px] ml-auto">
              Checked Out
            </Badge>
          )}
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        Applies to all {registration.people_count} participant(s). The registration
        counts as checked-in/out when at least one participant is.
      </p>

      {pending && (
        <AlertDialog
          open
          onOpenChange={(open) => !open && !submitting && setPending(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle
                  className={`size-5 ${
                    CHECKIN_ACTIONS[pending].destructive
                      ? "text-destructive"
                      : "text-amber-500"
                  }`}
                />
                {CHECKIN_ACTIONS[pending].title}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {CHECKIN_ACTIONS[pending].describe(
                  registration.confirmation_code,
                  registration.people_count
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={
                  CHECKIN_ACTIONS[pending].destructive
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/70 active:scale-[0.97]"
                    : ""
                }
                onClick={(e) => {
                  e.preventDefault();
                  apply(pending);
                }}
                disabled={submitting}
              >
                {submitting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}

// ─── Stay Details Section (editable) ────────────────────────

function StayDetailsSection({
  registration,
  registrationGroups,
  onSaved,
}: {
  registration: RegistrationRow;
  registrationGroups: { id: string; name_en: string }[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startDate, setStartDate] = useState(registration.start_date);
  const [endDate, setEndDate] = useState(registration.end_date);
  const currentGroupId = registration.registration_group_id ?? "";
  const [regGroupId, setRegGroupId] = useState(currentGroupId);

  useEffect(() => {
    setStartDate(registration.start_date);
    setEndDate(registration.end_date);
    setRegGroupId(currentGroupId);
    setEditing(false);
  }, [registration.id, registration.start_date, registration.end_date, currentGroupId]);

  const computedNights = Math.max(
    0,
    Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
    ),
  );

  const handleSave = async () => {
    const payload: Record<string, unknown> = {};
    if (startDate !== registration.start_date) payload.start_date = startDate;
    if (endDate !== registration.end_date) payload.end_date = endDate;
    if (regGroupId !== currentGroupId) payload.registration_group_id = regGroupId || null;
    if (Object.keys(payload).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registration.id}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Stay details saved");
        setEditing(false);
        onSaved();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save");
    }
    setSaving(false);
  };

  return (
    <section>
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
        <CalendarDays className="size-4" />
        Stay Details
        {!editing ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs ml-auto"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3 mr-1" />
            Edit
          </Button>
        ) : null}
      </h3>
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Check-in</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Check-out</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Nights: {computedNights}. Changing dates does NOT recalculate fees — use the Adjustments tab to record any monetary delta.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-medium">Registration Group</label>
            <Select value={regGroupId || "__none__"} onValueChange={(v) => setRegGroupId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {registrationGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name_en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Save className="size-3 mr-1" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => {
              setStartDate(registration.start_date);
              setEndDate(registration.end_date);
              setRegGroupId(currentGroupId);
              setEditing(false);
            }}>
              <X className="size-3 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <InfoRow label="Check-in">{registration.start_date}</InfoRow>
          <InfoRow label="Check-out">{registration.end_date}</InfoRow>
          <InfoRow label="Nights">{registration.nights_count}</InfoRow>
          <InfoRow label="Reg. Group">{registration.registration_group_name ?? "-"}</InfoRow>
          <InfoRow label="Reg. Type">{registration.registration_type === "others" ? "Others" : "Self"}</InfoRow>
          <InfoRow label="Groups">{registration.group_count}</InfoRow>
        </div>
      )}
    </section>
  );
}

// ─── Group Preferences + Key Count Row (editable) ───────────

function GroupPreferencesRow({
  group,
  registrationId,
  onChanged,
}: {
  group: {
    id: string;
    display_group_code: string;
    preferences: { elderly: boolean; handicapped: boolean; firstFloor: boolean } | null;
    key_count: number;
  };
  registrationId: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialPrefs = group.preferences ?? { elderly: false, handicapped: false, firstFloor: false };
  const [prefs, setPrefs] = useState(initialPrefs);
  const [keyCount, setKeyCount] = useState(group.key_count ?? 0);

  useEffect(() => {
    setPrefs(group.preferences ?? { elderly: false, handicapped: false, firstFloor: false });
    setKeyCount(group.key_count ?? 0);
    setEditing(false);
  }, [group.id, group.preferences, group.key_count]);

  const summary = [
    prefs.elderly && "Elderly",
    prefs.handicapped && "Handicapped",
    prefs.firstFloor && "1st Floor",
  ].filter(Boolean).join(", ") || "None";

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/group/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: prefs, key_count: keyCount }),
      });
      if (res.ok) {
        toast.success("Preferences saved");
        setEditing(false);
        onChanged();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save");
    }
    setSaving(false);
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={prefs.elderly} onChange={(e) => setPrefs({ ...prefs, elderly: e.target.checked })} />
            Elderly
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={prefs.handicapped} onChange={(e) => setPrefs({ ...prefs, handicapped: e.target.checked })} />
            Handicapped
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={prefs.firstFloor} onChange={(e) => setPrefs({ ...prefs, firstFloor: e.target.checked })} />
            1st Floor
          </label>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium">Key Deposit Count</label>
          <Input
            type="number"
            min={0}
            value={keyCount}
            onChange={(e) => setKeyCount(Math.max(0, Number(e.target.value) || 0))}
            className="h-8 w-20 text-sm"
          />
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" className="h-7 px-2" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Save className="size-3 mr-1" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(false)}>
              <X className="size-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Prefs:</span>
      <span>{summary}</span>
      <span className="text-muted-foreground ml-3">Keys:</span>
      <span>{keyCount}</span>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs ml-auto" onClick={() => setEditing(true)}>
        <Pencil className="size-3 mr-1" />
        Edit
      </Button>
    </div>
  );
}

// ─── Notes Section ──────────────────────────────────────────

function NotesSection({
  registrationId,
  initialNotes,
  additionalRequests,
  onRefresh,
}: {
  registrationId: string;
  initialNotes: string | null;
  additionalRequests: string | null;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [editingRequests, setEditingRequests] = useState(false);
  const [requests, setRequests] = useState(additionalRequests ?? "");
  const [savingRequests, setSavingRequests] = useState(false);

  useEffect(() => {
    setNotes(initialNotes ?? "");
    setEditing(false);
  }, [initialNotes]);

  useEffect(() => {
    setRequests(additionalRequests ?? "");
    setEditingRequests(false);
  }, [additionalRequests]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() }),
      });
      if (res.ok) {
        toast.success("Notes saved");
        setEditing(false);
        onRefresh();
      } else {
        toast.error("Failed to save notes");
      }
    } catch {
      toast.error("Failed to save notes");
    }
    setSaving(false);
  };

  const handleSaveRequests = async () => {
    setSavingRequests(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ additional_requests: requests.trim() }),
      });
      if (res.ok) {
        toast.success("Additional requests saved");
        setEditingRequests(false);
        onRefresh();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save");
    }
    setSavingRequests(false);
  };

  return (
    <section>
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
        <FileText className="size-4" />
        Notes & Requests
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs ml-auto"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3 mr-1" />
            Edit
          </Button>
        )}
      </h3>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add admin notes..."
            rows={3}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Save className="size-3 mr-1" />}
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setNotes(initialNotes ?? "");
                setEditing(false);
              }}
            >
              <X className="size-3 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-2">
          <p className="text-xs text-muted-foreground mb-1">Notes</p>
          <p className="text-sm bg-muted/50 rounded-md p-2 min-h-[2rem]">
            {initialNotes || <span className="text-muted-foreground italic">No notes</span>}
          </p>
        </div>
      )}

      <div className="mt-3">
        <div className="flex items-center mb-1">
          <p className="text-xs text-muted-foreground">Additional Requests</p>
          {!editingRequests && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs ml-auto"
              onClick={() => setEditingRequests(true)}
            >
              <Pencil className="size-3 mr-1" />
              Edit
            </Button>
          )}
        </div>
        {editingRequests ? (
          <div className="space-y-2">
            <Textarea
              value={requests}
              onChange={(e) => setRequests(e.target.value)}
              placeholder="Edit additional requests..."
              rows={3}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveRequests} disabled={savingRequests}>
                {savingRequests ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Save className="size-3 mr-1" />}
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRequests(additionalRequests ?? "");
                  setEditingRequests(false);
                }}
              >
                <X className="size-3 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm bg-muted/50 rounded-md p-2 min-h-[2rem]">
            {additionalRequests || <span className="text-muted-foreground italic">No additional requests</span>}
          </p>
        )}
      </div>
    </section>
  );
}

// ─── Room Assignment Row ────────────────────────────────────

function RoomAssignRow({
  group,
  registrationId,
  allRooms,
  onChanged,
}: {
  group: { id: string; display_group_code: string; room_number: string | null; room_id: string | null };
  registrationId: string;
  allRooms: { id: string; room_number: string; building_name: string; floor_number: string }[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState(group.room_id ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/room`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: group.id,
          roomId: selectedRoomId && selectedRoomId !== "__none__" ? selectedRoomId : null,
        }),
      });
      if (res.ok) {
        toast.success(selectedRoomId ? "Room changed" : "Room unassigned");
        setEditing(false);
        onChanged();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to change room");
      }
    } catch {
      toast.error("Failed to change room");
    }
    setSaving(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono text-xs text-muted-foreground shrink-0">{group.display_group_code}:</span>
        <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
          <SelectTrigger className="h-7 text-xs flex-1">
            <SelectValue placeholder="No room" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— No room —</SelectItem>
            {allRooms.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.room_number} ({r.building_name} {r.floor_number}F)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-7 px-2 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(false)}>
          <X className="size-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between text-sm">
      <span>
        <span className="font-mono text-xs text-muted-foreground">{group.display_group_code}:</span>{" "}
        <span className="font-medium">{group.room_number ?? <span className="text-muted-foreground italic">Unassigned</span>}</span>
      </span>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setSelectedRoomId(group.room_id ?? ""); setEditing(true); }}>
        <Pencil className="size-3 mr-1" />
        Change
      </Button>
    </div>
  );
}

// ─── Lodging Type Changer ─────────────────────────────────

function LodgingTypeRow({
  group,
  registrationId,
  lodgingOptions,
  onChanged,
}: {
  group: { id: string; display_group_code: string; lodging_type: string | null };
  registrationId: string;
  lodgingOptions: { code: string; name_en: string }[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [selectedType, setSelectedType] = useState(group.lodging_type ?? "");
  const [saving, setSaving] = useState(false);

  const formatLodging = (code: string | null) =>
    code?.replace(/^LODGING_/, "").replace(/_/g, " ") ?? "None";

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/lodging`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: group.id,
          lodgingType: selectedType && selectedType !== "__none__" ? selectedType : null,
        }),
      });
      if (res.ok) {
        toast.success("Lodging type updated");
        setEditing(false);
        onChanged();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update lodging type");
      }
    } catch {
      toast.error("Failed to update lodging type");
    }
    setSaving(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 text-sm pl-4">
        <span className="text-xs text-muted-foreground shrink-0">Lodging:</span>
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="h-7 text-xs flex-1">
            <SelectValue placeholder="No lodging" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {lodgingOptions.map((o) => (
              <SelectItem key={o.code} value={o.code}>
                {o.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-7 px-2 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(false)}>
          <X className="size-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between text-sm pl-4">
      <span>
        <span className="text-xs text-muted-foreground">Lodging:</span>{" "}
        <span className="text-xs">{formatLodging(group.lodging_type)}</span>
      </span>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setSelectedType(group.lodging_type ?? ""); setEditing(true); }}>
        <Pencil className="size-3 mr-1" />
        Change
      </Button>
    </div>
  );
}

// ─── Manual Payment Status Changer ─────────────────────────

const PAYMENT_STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "SUCCEEDED", label: "Succeeded" },
  { value: "FAILED", label: "Failed" },
  { value: "REFUNDED", label: "Refunded" },
];

function ManualPaymentStatusChanger({
  registrationId,
  currentStatus,
  onChanged,
}: {
  registrationId: string;
  currentStatus: string | null;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (newStatus: string) => {
    if (newStatus === currentStatus) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/payment-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Payment status changed to ${newStatus}`);
        onChanged();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update payment status");
      }
    } catch {
      toast.error("Failed to update payment status");
    }
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-2 mt-3 text-sm">
      <span className="text-muted-foreground shrink-0">Payment Status:</span>
      <Select value={currentStatus ?? ""} onValueChange={handleChange} disabled={saving}>
        <SelectTrigger className="h-7 w-[150px] text-xs">
          <SelectValue placeholder="Set status..." />
        </SelectTrigger>
        <SelectContent>
          {PAYMENT_STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {saving && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
    </div>
  );
}

/**
 * Re-label the payment method of a manual (non-card) payment. Card payments
 * never render this — switching to/from card is excluded by design, since card
 * is settled through Stripe. This is a label-only correction.
 */
function PaymentMethodChanger({
  registrationId,
  currentMethod,
  onChanged,
}: {
  registrationId: string;
  currentMethod: string | null;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (newMethod: string) => {
    if (newMethod === currentMethod) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/payment-method`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_method: newMethod }),
      });
      if (res.ok) {
        toast.success(`Payment method changed to ${newMethod.replace(/_/g, " ")}`);
        onChanged();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update payment method");
      }
    } catch {
      toast.error("Failed to update payment method");
    }
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-2 mt-3 text-sm">
      <span className="text-muted-foreground shrink-0">Payment Method:</span>
      <Select value={currentMethod ?? ""} onValueChange={handleChange} disabled={saving}>
        <SelectTrigger className="h-7 w-[180px] text-xs">
          <SelectValue placeholder="Set method..." />
        </SelectTrigger>
        <SelectContent>
          {EDITABLE_PAYMENT_METHODS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {saving && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function InfoRow({
  label,
  icon: Icon,
  className,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <span className="text-muted-foreground inline-flex items-center gap-1">
        {Icon && <Icon className="size-3" />}
        {label}:
      </span>{" "}
      <span className="font-medium">{children}</span>
    </div>
  );
}

function PersonCard({ person: p, registrationId, regStartDate, regEndDate, eventStartDate, eventEndDate, totalPeople, allRegistrations, transferredInFrom, onSaved, churches, departments }: {
  person: PersonDetail;
  registrationId: string;
  regStartDate: string;
  regEndDate: string;
  eventStartDate: string | null;
  eventEndDate: string | null;
  totalPeople: number;
  allRegistrations: { id: string; confirmation_code: string; registrant_name: string; status: string }[];
  transferredInFrom?: string | null;
  onSaved: () => void;
  churches: { id: string; name_en: string; name_ko: string | null; is_other: boolean }[];
  departments: { id: string; name_en: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferring, setTransferring] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/participants/${p.membership_id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(`${p.first_name_en} ${p.last_name_en} removed`);
        setConfirmDelete(false);
        onSaved();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to remove participant");
      }
    } catch {
      toast.error("Failed to remove participant");
    }
    setDeleting(false);
  };

  const handleTransfer = async () => {
    if (!transferTarget) return;
    setTransferring(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/participants/${p.membership_id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRegistrationId: transferTarget }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Transferred to ${data.targetConfirmationCode}`);
        setShowTransfer(false);
        setTransferTarget("");
        onSaved();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to transfer");
      }
    } catch {
      toast.error("Failed to transfer");
    }
    setTransferring(false);
  };

  const isChurchOther = (churchId: string | undefined) => {
    if (!churchId) return false;
    return churches.find((c) => c.id === churchId)?.is_other ?? false;
  };

  const [form, setForm] = useState({
    first_name_en: p.first_name_en,
    last_name_en: p.last_name_en,
    display_name_ko: p.display_name_ko ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    gender: p.gender,
    birth_date: p.birth_date ?? "",
    is_k12: p.is_k12,
    grade: p.grade ?? "",
    church_id: p.church_id ?? "",
    church_other: p.church_other ?? "",
    church_role: p.church_role ?? "",
    department_id: p.department_id ?? "",
    guardian_name: p.guardian_name ?? "",
    guardian_phone: p.guardian_phone ?? "",
  });

  useEffect(() => {
    setForm({
      first_name_en: p.first_name_en,
      last_name_en: p.last_name_en,
      display_name_ko: p.display_name_ko ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
      gender: p.gender,
      birth_date: p.birth_date ?? "",
      is_k12: p.is_k12,
      grade: p.grade ?? "",
      church_id: p.church_id ?? "",
      church_other: p.church_other ?? "",
      church_role: p.church_role ?? "",
      department_id: p.department_id ?? "",
      guardian_name: p.guardian_name ?? "",
      guardian_phone: p.guardian_phone ?? "",
    });
  }, [p]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        first_name_en: form.first_name_en,
        last_name_en: form.last_name_en,
        display_name_ko: form.display_name_ko || null,
        email: form.email || null,
        phone: form.phone || null,
        gender: form.gender,
        birth_date: form.birth_date || null,
        is_k12: form.is_k12,
        grade: form.is_k12 ? (form.grade || null) : null,
        church_id: form.church_id || null,
        church_other: isChurchOther(form.church_id) ? (form.church_other || null) : null,
        church_role: form.church_role || null,
        department_id: form.department_id || null,
        guardian_name: form.guardian_name || null,
        guardian_phone: form.guardian_phone || null,
      };
      const res = await fetch(`/api/admin/people/${p.person_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Participant updated");
        setEditing(false);
        onSaved();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update");
      }
    } catch {
      toast.error("Failed to update");
    }
    setSaving(false);
  };

  if (editing) {
    return (
      <div className="rounded-lg border p-4 space-y-4 bg-muted/20">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs">{p.role}</Badge>
          <span className="font-mono text-xs text-muted-foreground">{p.group_code}</span>
        </div>

        {/* Name Section */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">First Name (Legal)</label>
              <Input value={form.first_name_en} onChange={(e) => setForm({ ...form, first_name_en: e.target.value.toUpperCase() })} className="h-9 text-sm" placeholder="FIRST NAME" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Last Name (Legal)</label>
              <Input value={form.last_name_en} onChange={(e) => setForm({ ...form, last_name_en: e.target.value.toUpperCase() })} className="h-9 text-sm" placeholder="LAST NAME" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Display Name</label>
            <Input value={form.display_name_ko} onChange={(e) => setForm({ ...form, display_name_ko: e.target.value })} className="h-9 text-sm" placeholder="Name on badge" />
            <p className="text-[0.625rem] text-muted-foreground">This name will be printed on the name badge.</p>
          </div>
        </div>

        <Separator />

        {/* Personal Info */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Personal Info</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Gender</label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="NON_BINARY">Non-binary</SelectItem>
                  <SelectItem value="PREFER_NOT_TO_SAY">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Date of Birth</label>
              <Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} className="h-9 text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`k12-${p.person_id}`}
              checked={form.is_k12}
              onChange={(e) => setForm({ ...form, is_k12: e.target.checked, grade: e.target.checked ? form.grade : "" })}
              className="size-4 rounded border-gray-300"
            />
            <label htmlFor={`k12-${p.person_id}`} className="text-xs">Pre-K/K-12 student (high school or younger)</label>
          </div>
          {form.is_k12 && (
            <div className="space-y-1">
              <label className="text-xs font-medium">Grade</label>
              <Select value={form.grade} onValueChange={(v) => setForm({ ...form, grade: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select grade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRE_K">Pre-K</SelectItem>
                  <SelectItem value="KINDERGARTEN">Kindergarten</SelectItem>
                  <SelectItem value="GRADE_1">1st Grade</SelectItem>
                  <SelectItem value="GRADE_2">2nd Grade</SelectItem>
                  <SelectItem value="GRADE_3">3rd Grade</SelectItem>
                  <SelectItem value="GRADE_4">4th Grade</SelectItem>
                  <SelectItem value="GRADE_5">5th Grade</SelectItem>
                  <SelectItem value="GRADE_6">6th Grade</SelectItem>
                  <SelectItem value="GRADE_7">7th Grade</SelectItem>
                  <SelectItem value="GRADE_8">8th Grade</SelectItem>
                  <SelectItem value="GRADE_9">9th Grade</SelectItem>
                  <SelectItem value="GRADE_10">10th Grade</SelectItem>
                  <SelectItem value="GRADE_11">11th Grade</SelectItem>
                  <SelectItem value="GRADE_12">12th Grade</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Separator />

        {/* Contact */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Email</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-9 text-sm" placeholder="email@example.com" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Phone</label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-9 text-sm" placeholder="Phone number" />
            </div>
          </div>
        </div>

        <Separator />

        {/* Church & Department */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Church & Department</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Church</label>
              <ChurchCombobox
                churches={churches}
                value={form.church_id}
                onValueChange={(v) => setForm({ ...form, church_id: v, church_other: isChurchOther(v) ? form.church_other : "" })}
                placeholder="Select church"
                className="h-9 text-sm"
              />
              {isChurchOther(form.church_id) && (
                <Input value={form.church_other} onChange={(e) => setForm({ ...form, church_other: e.target.value })} className="h-9 text-sm mt-1" placeholder="Enter church name" />
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Department</label>
              <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v === "__none__" ? "" : v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name_en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Church Position (직분) <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Select value={form.church_role || "__none__"} onValueChange={(v) => setForm({ ...form, church_role: v === "__none__" ? "" : v })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                <SelectItem value="MEMBER">Member (성도)</SelectItem>
                <SelectItem value="DEACON">Deacon (집사)</SelectItem>
                <SelectItem value="ELDER">Elder (장로)</SelectItem>
                <SelectItem value="MINISTER">Minister (전도사)</SelectItem>
                <SelectItem value="PASTOR">Pastor (목사)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {/* Guardian */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Guardian</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Guardian Name</label>
              <Input value={form.guardian_name} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} className="h-9 text-sm" placeholder="Full name" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Guardian Phone</label>
              <Input value={form.guardian_phone} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} className="h-9 text-sm" placeholder="Phone number" />
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Save className="size-3 mr-1" />}
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            <X className="size-3 mr-1" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const transferOptions = allRegistrations.filter((r) => r.id !== registrationId);

  return (
    <>
      <div className="rounded-lg border p-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium text-sm">
              {p.first_name_en} {p.last_name_en}
              {p.display_name_ko && (
                <span className="ml-1.5 text-muted-foreground font-normal">
                  ({p.display_name_ko})
                </span>
              )}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {p.role}
              </Badge>
              {transferredInFrom !== undefined && transferredInFrom !== null && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <ArrowRightLeft className="size-2.5" />
                  from {transferredInFrom}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {p.gender} · {p.age_at_event ? `Age ${p.age_at_event}` : "-"}
                {p.is_k12 && " · K-12"}
                {p.grade && ` (${p.grade})`}
              </span>
            </div>
          </div>
          <div className="flex items-start gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setEditing(true)}
              title="Edit"
            >
              <Pencil className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setShowTransfer(true)}
              title="Transfer to another registration"
            >
              <ArrowRightLeft className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              title="Remove participant"
              disabled={totalPeople <= 1}
            >
              <Trash2 className="size-3" />
            </Button>
            <div className="text-right ml-1">
              <span className="font-mono text-xs text-muted-foreground">
                {p.group_code}
              </span>
              {p.participant_code && (
                <p className="font-mono text-xs text-muted-foreground">
                  {p.participant_code}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Contact details */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
          {p.email && (
            <span className="flex items-center gap-1">
              <Mail className="size-3" />
              {p.email}
            </span>
          )}
          {p.phone && (
            <span className="flex items-center gap-1">
              <Phone className="size-3" />
              {p.phone}
            </span>
          )}
          {p.church_name && (
            <span className="flex items-center gap-1">
              <Church className="size-3" />
              {p.church_name}
            </span>
          )}
          {p.department_name && (
            <span className="flex items-center gap-1">
              <Building2 className="size-3" />
              {p.department_name}
            </span>
          )}
          {p.church_role && (
            <span className="flex items-center gap-1">
              <Church className="size-3" />
              {p.church_role.charAt(0) + p.church_role.slice(1).toLowerCase()}
            </span>
          )}
          {p.guardian_name && (
            <span className="flex items-center gap-1 col-span-2">
              <ShieldCheck className="size-3" />
              Guardian: {p.guardian_name}
              {p.guardian_phone && ` (${p.guardian_phone})`}
            </span>
          )}
        </div>

        {/* Per-participant stay dates + meals */}
        <StayAndMealsEditor
          person={p}
          registrationId={registrationId}
          regStartDate={regStartDate}
          regEndDate={regEndDate}
          eventStartDate={eventStartDate}
          eventEndDate={eventEndDate}
          onSaved={onSaved}
        />
      </div>

      {/* Delete Confirmation */}
      {confirmDelete && (
        <AlertDialog open onOpenChange={(open) => !open && setConfirmDelete(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-destructive" />
                Remove Participant
              </AlertDialogTitle>
              <AlertDialogDescription>
                Remove <strong>{p.first_name_en} {p.last_name_en}</strong> from this registration?
                This will deactivate their E-Pass. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Transfer Dialog */}
      {showTransfer && (
        <AlertDialog open onOpenChange={(open) => !open && setShowTransfer(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <ArrowRightLeft className="size-5" />
                Transfer Participant
              </AlertDialogTitle>
              <AlertDialogDescription>
                Clone <strong>{p.first_name_en} {p.last_name_en}</strong> into another registration
                as a MEMBER. A tracking record stays on this registration so its original payment
                can be reconciled.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div>
              <label className="text-sm font-medium">Target Registration</label>
              <Select value={transferTarget} onValueChange={setTransferTarget}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select registration..." />
                </SelectTrigger>
                <SelectContent>
                  {transferOptions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="font-mono">{r.confirmation_code}</span>
                      <span className="ml-2 text-muted-foreground">
                        {r.registrant_name}
                      </span>
                      <Badge variant="outline" className="ml-2 text-[10px]">{r.status}</Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {totalPeople <= 1 && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  This is the last participant. After transfer, this registration keeps a
                  tracking record but no active participants.
                </p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleTransfer}
                disabled={!transferTarget || transferring}
              >
                {transferring && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                Transfer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
