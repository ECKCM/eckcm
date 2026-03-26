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
} from "lucide-react";
import { toast } from "sonner";
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
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    status: string;
    label: string;
  } | null>(null);

  // Load participants when registration changes
  useEffect(() => {
    if (!registration) {
      setPeople([]);
      return;
    }
    loadPeople(registration.id);
  }, [registration?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPeople = async (regId: string) => {
    setLoadingPeople(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_group_memberships")
      .select(`
        role,
        participant_code,
        eckcm_people!inner(
          id, first_name_en, last_name_en, display_name_ko,
          gender, birth_date, age_at_event, is_k12, grade,
          email, phone, phone_country, church_other,
          guardian_name, guardian_phone,
          eckcm_churches(name_en),
          eckcm_departments(name_en)
        ),
        eckcm_groups!inner(display_group_code, registration_id)
      `)
      .eq("eckcm_groups.registration_id", regId);

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: PersonDetail[] = data.map((m: any) => ({
        person_id: m.eckcm_people.id,
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
        church_name:
          m.eckcm_people.church_other ||
          m.eckcm_people.eckcm_churches?.name_en ||
          null,
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
                    {formatMoney(reg.total_amount_cents)}
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
                    <span className="font-mono">
                      {reg.invoice_number ?? "-"}
                    </span>
                  </InfoRow>
                  <InfoRow label="Receipt">
                    <span className="font-mono">
                      {reg.invoice_number
                        ? reg.invoice_number.replace(/^INV-/, "RCT-")
                        : "-"}
                    </span>
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
                  <InfoRow label="Room">
                    {reg.room_numbers.length > 0
                      ? reg.room_numbers.join(", ")
                      : "-"}
                  </InfoRow>
                  <InfoRow label="Reg. Group">
                    {reg.registration_group_name ?? "-"}
                  </InfoRow>
                  <InfoRow label="Reg. Type">
                    {reg.registration_type === "others" ? "Others" : "Self"}
                  </InfoRow>
                  <InfoRow label="Groups">{reg.group_count}</InfoRow>
                </div>
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
                      <PersonCard person={representative} onSaved={() => { loadPeople(reg.id); onRefresh(); }} />
                    </div>
                  )}

                  {/* Members */}
                  {members.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Members ({members.length})
                      </h4>
                      <div className="space-y-2">
                        {members.map((p, i) => (
                          <PersonCard key={i} person={p} onSaved={() => { loadPeople(reg.id); onRefresh(); }} />
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
                            <TableHead>Korean</TableHead>
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
                  // Auto-fill with full current amount (Stripe refund is capped separately)
                  setNewAmountDollars((currentAmount / 100).toFixed(2));
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
              disabled={!reason.trim() || submitting || refundExceedsTotal}
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

function PersonCard({ person: p, onSaved }: { person: PersonDetail; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name_en: p.first_name_en,
    last_name_en: p.last_name_en,
    display_name_ko: p.display_name_ko ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    gender: p.gender,
    birth_date: p.birth_date ?? "",
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
      guardian_name: p.guardian_name ?? "",
      guardian_phone: p.guardian_phone ?? "",
    });
  }, [p]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/people/${p.person_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (editing) {
    return (
      <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs">{p.role}</Badge>
          <span className="font-mono text-xs text-muted-foreground">{p.group_code}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">First Name</label>
            <Input value={form.first_name_en} onChange={(e) => updateField("first_name_en", e.target.value)} className="h-8 text-sm mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Last Name</label>
            <Input value={form.last_name_en} onChange={(e) => updateField("last_name_en", e.target.value)} className="h-8 text-sm mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Korean Name</label>
            <Input value={form.display_name_ko} onChange={(e) => updateField("display_name_ko", e.target.value)} className="h-8 text-sm mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Gender</label>
            <Select value={form.gender} onValueChange={(v) => updateField("gender", v)}>
              <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <Input value={form.email} onChange={(e) => updateField("email", e.target.value)} className="h-8 text-sm mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Phone</label>
            <Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} className="h-8 text-sm mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Date of Birth</label>
            <Input type="date" value={form.birth_date} onChange={(e) => updateField("birth_date", e.target.value)} className="h-8 text-sm mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Guardian Name</label>
            <Input value={form.guardian_name} onChange={(e) => updateField("guardian_name", e.target.value)} className="h-8 text-sm mt-0.5" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Guardian Phone</label>
            <Input value={form.guardian_phone} onChange={(e) => updateField("guardian_phone", e.target.value)} className="h-8 text-sm mt-0.5" />
          </div>
        </div>
        <div className="flex gap-2">
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

  return (
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
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3" />
          </Button>
          <div className="text-right">
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
  );
}
