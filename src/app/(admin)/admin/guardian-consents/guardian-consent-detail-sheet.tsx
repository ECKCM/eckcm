"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  User,
  Phone,
  Church,
  ShieldCheck,
  CalendarDays,
  CheckCircle2,
  XCircle,
  PenLine,
} from "lucide-react";
import type { GuardianConsentRow } from "./guardian-consents-table";

interface GuardianConsentDetailSheetProps {
  consent: GuardianConsentRow | null;
  onClose: () => void;
}

export function GuardianConsentDetailSheet({
  consent,
  onClose,
}: GuardianConsentDetailSheetProps) {
  if (!consent) return null;

  const c = consent;

  return (
    <Sheet open={!!consent} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-xl flex items-center gap-2">
            <ShieldCheck className="size-5" />
            Guardian Consent
          </SheetTitle>
          <SheetDescription>
            {c.confirmation_code && (
              <span className="font-mono">{c.confirmation_code}</span>
            )}
          </SheetDescription>

          <div className="flex items-center gap-2 mt-2">
            {c.guardian_signature ? (
              <Badge variant="default" className="text-xs">
                <CheckCircle2 className="size-3 mr-1" />
                Signed
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                <XCircle className="size-3 mr-1" />
                Unsigned
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {c.registration_status}
            </Badge>
          </div>
        </SheetHeader>

        <Separator />

        <div className="space-y-5 mt-4">
          {/* Participant Info */}
          <section>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <User className="size-4" />
              Participant (Minor)
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <InfoRow label="Name">
                {c.first_name_en} {c.last_name_en}
              </InfoRow>
              {c.display_name_ko && (
                <InfoRow label="Korean Name">{c.display_name_ko}</InfoRow>
              )}
              <InfoRow label="Gender">{c.gender}</InfoRow>
              <InfoRow label="Age">
                {c.age_at_event != null ? `${c.age_at_event}` : "-"}
              </InfoRow>
              <InfoRow label="K-12">{c.is_k12 ? "Yes" : "No"}</InfoRow>
              {c.grade && <InfoRow label="Grade">{c.grade}</InfoRow>}
              {c.birth_date && (
                <InfoRow label="DOB" icon={CalendarDays}>
                  {c.birth_date}
                </InfoRow>
              )}
              {c.church_name && (
                <InfoRow label="Church" icon={Church}>
                  {c.church_name}
                </InfoRow>
              )}
              <InfoRow label="Group">
                <span className="font-mono">{c.display_group_code}</span>
              </InfoRow>
              <InfoRow label="Role">
                <Badge variant="outline" className="text-xs">
                  {c.group_role}
                </Badge>
              </InfoRow>
            </div>
          </section>

          <Separator />

          {/* Guardian Info */}
          <section>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <ShieldCheck className="size-4" />
              Guardian Information
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <InfoRow label="Guardian Name" className="col-span-2">
                <span className="font-medium">{c.guardian_name}</span>
              </InfoRow>
              {c.guardian_phone && (
                <InfoRow label="Phone" icon={Phone} className="col-span-2">
                  {c.guardian_phone}
                </InfoRow>
              )}
            </div>
          </section>

          <Separator />

          {/* Signature */}
          <section>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <PenLine className="size-4" />
              Signature
            </h3>
            {c.guardian_signature ? (
              <div className="rounded-lg border bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.guardian_signature}
                  alt={`Guardian signature by ${c.guardian_name}`}
                  className="max-w-full h-auto max-h-[200px] mx-auto"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                <XCircle className="size-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No signature on file</p>
              </div>
            )}
          </section>

          <Separator />

          {/* Consent Statement */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Consent Statement</h3>
            <div className="text-xs text-muted-foreground space-y-2 bg-muted/50 rounded-md p-3">
              <p>
                I authorize my child to attend the camp meeting unaccompanied by
                me or another legal guardian.
              </p>
              <p>
                I understand that the registrant is a minor. I confirm that the
                parent/guardian listed above has authorized this minor to serve
                as the group representative, and I consent to the
                parent/guardian being contacted in case of any issues or
                emergencies.
              </p>
            </div>
          </section>

          {/* Timestamp */}
          {c.registration_created_at && (
            <div className="text-xs text-muted-foreground text-right">
              Registered:{" "}
              {new Date(c.registration_created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

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
