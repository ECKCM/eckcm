"use client";

import { useState, useEffect } from "react";
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
import {
  ExternalLink,
  Copy,
  Users,
  CreditCard,
  CalendarDays,
  FileText,
  AlertTriangle,
  CheckCircle2,
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
  X,
  Trash2,
  ArrowRightLeft,
  BedDouble,
} from "lucide-react";
import { toast } from "sonner";
import { ChurchCombobox } from "@/components/shared/church-combobox";
import {
  type RegistrationRow,
  type PersonDetail,
  type Event,
  statusVariant,
  paymentStatusVariant,
  formatMoney,
  formatTimestamp,
  VALID_STATUSES,
  calculateProcessingFee,
} from "./registrations-types";

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
  const [groups, setGroups] = useState<{ id: string; display_group_code: string; room_number: string | null; room_id: string | null; lodging_type: string | null }[]>([]);
  // All rooms for room change dropdown
  const [allRooms, setAllRooms] = useState<{ id: string; room_number: string; building_name: string; floor_number: string }[]>([]);
  // Available lodging options for this event's registration group
  const [lodgingOptions, setLodgingOptions] = useState<{ code: string; name_en: string }[]>([]);

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
          for (const g of r.eckcm_groups ?? []) {
            for (const m of g.eckcm_group_memberships ?? []) {
              if (m.role === "REPRESENTATIVE" && m.eckcm_people) {
                registrantName = `${m.eckcm_people.first_name_en} ${m.eckcm_people.last_name_en}`;
              }
            }
          }
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
  }, [eventId]);

  // Load participants and groups when registration changes
  useEffect(() => {
    if (!registration) {
      setPeople([]);
      setGroups([]);
      return;
    }
    loadPeople(registration.id);
    loadGroups(registration.id);
  }, [registration?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPeople = async (regId: string) => {
    setLoadingPeople(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_group_memberships")
      .select(`
        id,
        group_id,
        role,
        participant_code,
        eckcm_people!inner(
          id, first_name_en, last_name_en, display_name_ko,
          gender, birth_date, age_at_event, is_k12, grade,
          email, phone, phone_country, church_id, church_other,
          department_id, guardian_name, guardian_phone,
          eckcm_churches(id, name_en),
          eckcm_departments(id, name_en)
        ),
        eckcm_groups!inner(id, display_group_code, registration_id)
      `)
      .eq("eckcm_groups.registration_id", regId);

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
        guardian_name: m.eckcm_people.guardian_name,
        guardian_phone: m.eckcm_people.guardian_phone,
        group_code: m.eckcm_groups.display_group_code,
        role: m.role,
        participant_code: m.participant_code,
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
        id, display_group_code, lodging_type,
        eckcm_room_assignments(eckcm_rooms(id, room_number))
      `)
      .eq("registration_id", regId);

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setGroups(data.map((g: any) => {
        const ra = g.eckcm_room_assignments?.[0];
        return {
          id: g.id,
          display_group_code: g.display_group_code,
          lodging_type: g.lodging_type ?? null,
          room_number: ra?.eckcm_rooms?.room_number ?? null,
          room_id: ra?.eckcm_rooms?.id ?? null,
        };
      }));
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
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">
                    {(() => {
                      if (reg.status === "CANCELLED" || reg.status === "REFUNDED") return formatMoney(0);
                      if (
                        (reg.payment_status === "PARTIALLY_REFUNDED" || reg.payment_status === "REFUNDED") &&
                        reg.total_amount_cents > 0 &&
                        reg.total_amount_cents <= calculateProcessingFee(reg.payment_amount_cents, reg.payment_method)
                      ) return formatMoney(0);
                      return formatMoney(reg.total_amount_cents);
                    })()}
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

              {/* Payment & Invoice */}
              <section>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <CreditCard className="size-4" />
                  Payment & Invoice
                </h3>
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
                    {reg.invoice_id && reg.payment_status === "SUCCEEDED" ? (
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
                {/* Manual payment status changer */}
                {reg.payment_method && ["ZELLE", "CHECK", "MANUAL", "MANUAL_PAYMENT"].includes(reg.payment_method.toUpperCase()) && (
                  <ManualPaymentStatusChanger
                    registrationId={reg.id}
                    currentStatus={reg.payment_status}
                    onChanged={onRefresh}
                  />
                )}
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

              {/* Stay Details */}
              <section>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <CalendarDays className="size-4" />
                  Stay Details
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <InfoRow label="Check-in">{reg.start_date}</InfoRow>
                  <InfoRow label="Check-out">{reg.end_date}</InfoRow>
                  <InfoRow label="Reg. Group">
                    {reg.registration_group_name ?? "-"}
                  </InfoRow>
                  <InfoRow label="Reg. Type">
                    {reg.registration_type === "others" ? "Others" : "Self"}
                  </InfoRow>
                  <InfoRow label="Groups">{reg.group_count}</InfoRow>
                </div>

                {/* Room assignments & lodging per group */}
                {groups.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <BedDouble className="size-3" />
                      Room &amp; Lodging
                    </h4>
                    {groups.map((g) => (
                      <div key={g.id} className="space-y-1">
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
                      </div>
                    ))}
                  </div>
                )}
              </section>

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
              ) : people.length === 0 ? (
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
                        totalPeople={people.length}
                        allRegistrations={allRegistrations}
                        onSaved={() => { loadPeople(reg.id); loadGroups(reg.id); onRefresh(); }}
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
                            totalPeople={people.length}
                            allRegistrations={allRegistrations}
                            onSaved={() => { loadPeople(reg.id); loadGroups(reg.id); onRefresh(); }}
                            churches={churches}
                            departments={departments}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Compact table view toggle */}
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
                </div>
              )}
            </TabsContent>

            {/* ─── Adjustments Tab ─── */}
            <TabsContent value="adjustments" className="mt-4">
              <AdjustmentsPanel
                registrationId={reg.id}
                currentAmount={reg.total_amount_cents}
                paymentMethod={reg.payment_method}
                onAdjustmentCreated={onRefresh}
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
      const inputCents = Math.round(parseFloat(newAmountDollars) * 100);
      const apiNewAmount = newAction === "refund"
        ? Math.max(0, currentAmount - inputCents)
        : inputCents;
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
        toast.success("Adjustment created");
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

  const inputCents = Math.round(parseFloat(newAmountDollars) * 100) || 0;
  const isRefundAction = newAction === "refund";
  // When action is "refund", input = refund amount; otherwise input = new total
  const newAmountCents = isRefundAction ? currentAmount - inputCents : inputCents;
  const diff = newAmountCents - currentAmount;

  // Refund limit: processing fee is non-refundable
  const feeBase = summary && summary.original_amount > 0 ? summary.original_amount : currentAmount;
  const processingFee = feeBase > 0 ? calculateProcessingFee(feeBase, paymentMethod) : 0;
  const maxRefundTotal = feeBase - processingFee;
  const availableRefund = summary ? Math.max(0, maxRefundTotal - summary.total_refunded) : 0;
  // Stripe refund is capped at availableRefund; registration total goes to 0 on full refund
  const stripeRefund = isRefundAction ? Math.min(inputCents, availableRefund) : 0;
  const refundExceedsTotal = isRefundAction && inputCents > currentAmount;
  const refundExceedsAvailable = isRefundAction && processingFee > 0 && inputCents > availableRefund;

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
          setNewAmountDollars((currentAmount / 100).toFixed(2));
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
                {isRefundAction ? "Refund Amount ($)" : "New Total ($)"}
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
                    {processingFee > 0 && inputCents > 0 && (
                      <> · Stripe refund: {formatMoney(stripeRefund)}
                        {inputCents > availableRefund && ` (fee ${formatMoney(processingFee)} non-refundable)`}
                      </>
                    )}
                  </p>
                  {refundExceedsAvailable && !refundExceedsTotal && (
                    <p className="text-destructive">
                      Max refundable: {formatMoney(availableRefund)} (fee {formatMoney(processingFee)} non-refundable)
                    </p>
                  )}
                  {refundExceedsTotal && (
                    <p className="text-destructive">
                      Cannot refund more than current amount ({formatMoney(currentAmount)})
                    </p>
                  )}
                </div>
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
                setNewAction(val);
                if (val === "refund") {
                  // Auto-fill with max refundable (processing fee deducted)
                  const maxRefund = availableRefund > 0 ? availableRefund : currentAmount;
                  setNewAmountDollars((maxRefund / 100).toFixed(2));
                } else if (newAction === "refund") {
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
              disabled={!reason.trim() || submitting || refundExceedsTotal || refundExceedsAvailable}
            >
              {submitting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Confirm Adjustment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              {processAction === "refund" && processingAdj && processingFee > 0 && (
                <p className="text-xs mt-1.5 text-muted-foreground">
                  Actual refund: {formatMoney(Math.min(Math.abs(processingAdj.difference), availableRefund))}{" "}
                  (fee {formatMoney(processingFee)} non-refundable)
                </p>
              )}
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

  useEffect(() => {
    setNotes(initialNotes ?? "");
    setEditing(false);
  }, [initialNotes]);

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

      {additionalRequests && (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground mb-1">Additional Requests</p>
          <p className="text-sm bg-muted/50 rounded-md p-2">{additionalRequests}</p>
        </div>
      )}
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

function PersonCard({ person: p, registrationId, totalPeople, allRegistrations, onSaved, churches, departments }: {
  person: PersonDetail;
  registrationId: string;
  totalPeople: number;
  allRegistrations: { id: string; confirmation_code: string; registrant_name: string; status: string }[];
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
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {p.role}
              </Badge>
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
          {p.guardian_name && (
            <span className="flex items-center gap-1 col-span-2">
              <ShieldCheck className="size-3" />
              Guardian: {p.guardian_name}
              {p.guardian_phone && ` (${p.guardian_phone})`}
            </span>
          )}
        </div>
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
                Transfer <strong>{p.first_name_en} {p.last_name_en}</strong> to another registration.
                They will be added as a MEMBER in the target group.
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
                <p className="text-xs text-destructive mt-1.5">
                  This is the last participant. Cannot transfer.
                </p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleTransfer}
                disabled={!transferTarget || transferring || totalPeople <= 1}
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
