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
          first_name_en, last_name_en, display_name_ko,
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
                    className="text-muted-foreground hover:text-foreground"
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
              {(reg.notes || reg.additional_requests) && (
                <>
                  <Separator />
                  <section>
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <FileText className="size-4" />
                      Notes & Requests
                    </h3>
                    {reg.notes && (
                      <div className="mb-2">
                        <p className="text-xs text-muted-foreground mb-1">
                          Notes
                        </p>
                        <p className="text-sm bg-muted/50 rounded-md p-2">
                          {reg.notes}
                        </p>
                      </div>
                    )}
                    {reg.additional_requests && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Additional Requests
                        </p>
                        <p className="text-sm bg-muted/50 rounded-md p-2">
                          {reg.additional_requests}
                        </p>
                      </div>
                    )}
                  </section>
                </>
              )}

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
                      <PersonCard person={representative} />
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
                          <PersonCard key={i} person={p} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Compact table view toggle */}
                  <Separator />
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground text-xs">
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
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
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

function PersonCard({ person: p }: { person: PersonDetail }) {
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
