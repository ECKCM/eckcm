"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ScanLine,
  User,
  Loader2,
  Beaker,
} from "lucide-react";

export type MealCategory = "adult" | "youth" | "free";

export interface ScanResultPerson {
  id?: string;
  name: string;
  koreanName?: string | null;
  participantCode?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  mealCategory?: MealCategory | null;
  isEpassActive?: boolean;
}

export interface ScanResultRegistration {
  id?: string;
  confirmationCode?: string;
  status?: string;
}

export interface ScanResult {
  status: "checked_in" | "already_checked_in" | "checked_out" | "already_checked_out" | "error";
  person?: ScanResultPerson;
  registration?: ScanResultRegistration;
  /** Kept at top-level for backward compatibility with existing call sites. */
  confirmationCode?: string;
  errorMessage?: string;
  checkinType?: string;
  mealType?: string;
  mealDate?: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  totalCount?: number;
  timestamp: Date;
  isOffline?: boolean;
  /**
   * Optimistic preview rendered from the local cache. Status is provisional
   * until the server verify call lands and clears this flag.
   */
  isPending?: boolean;
  /** True when this result came from a sandbox session. */
  isSandbox?: boolean;
}

interface ScanResultCardProps {
  result: ScanResult | null;
  /**
   * Phone-first main check-in: show only the line banner, status, Legal Name,
   * and Reg code. Hides Korean name, Participant ID, and the gender / meal /
   * registration-status badges and counters to keep the card glanceable.
   */
  minimal?: boolean;
}

/**
 * Pre-paid registrations (PAID / APPROVED) get the "Fast Track" line — they
 * just walk through. Everyone else (typically SUBMITTED / on-site payers) goes
 * to the "On Site" line for manual handling. Offline cache scans only ever pass
 * PAID registrations, so a missing status is treated as Fast Track.
 */
export type CheckinLine = "fast_track" | "on_site";

export function resolveCheckinLine(status?: string): CheckinLine {
  if (!status) return "fast_track";
  return status === "PAID" || status === "APPROVED" ? "fast_track" : "on_site";
}

const LINE_CONFIG: Record<
  CheckinLine,
  { label: string; cardClass: string; badgeClass: string; chipClass: string }
> = {
  fast_track: {
    label: "Fast Track",
    cardClass:
      "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
    badgeClass:
      "border-emerald-400 bg-emerald-500 text-white dark:border-emerald-600 dark:bg-emerald-600",
    chipClass:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  on_site: {
    label: "On Site",
    cardClass:
      "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
    badgeClass:
      "border-orange-400 bg-orange-500 text-white dark:border-orange-600 dark:bg-orange-600",
    chipClass:
      "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300",
  },
};

/** Big, glanceable line banner so operators can route people instantly. */
export function CheckinLineBanner({ line }: { line: CheckinLine }) {
  const cfg = LINE_CONFIG[line];
  return (
    <div
      className={`flex items-center justify-center rounded-md px-3 py-2 text-lg font-extrabold uppercase tracking-wide ${cfg.cardClass}`}
    >
      {cfg.label}
    </div>
  );
}

/** Compact line chip for dense lists (Recent Check-ins). */
export function CheckinLineChip({ line }: { line: CheckinLine }) {
  const cfg = LINE_CONFIG[line];
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${cfg.chipClass}`}>
      {cfg.label}
    </Badge>
  );
}

const MEAL_LABEL: Record<MealCategory, string> = {
  adult: "General",
  youth: "Youth",
  free: "Free",
};

const MEAL_CLASSES: Record<MealCategory, string> = {
  adult:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  youth:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300",
  free:
    "border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
};

function GenderBadge({ gender }: { gender?: string | null }) {
  if (gender !== "MALE" && gender !== "FEMALE") return null;
  return (
    <Badge
      variant="outline"
      className={
        gender === "MALE"
          ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
          : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
      }
    >
      {gender === "MALE" ? "Male" : "Female"}
    </Badge>
  );
}

function MealCategoryBadge({ category }: { category?: MealCategory | null }) {
  if (!category) return null;
  return (
    <Badge variant="outline" className={MEAL_CLASSES[category]}>
      {MEAL_LABEL[category]}
    </Badge>
  );
}

function RegistrationStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const intent: Record<string, string> = {
    PAID: "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300",
    APPROVED:
      "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300",
    SUBMITTED:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300",
    DRAFT:
      "border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
  };
  const cls = intent[status] ?? "border-gray-300 bg-gray-50 text-gray-700";
  return (
    <Badge variant="outline" className={cls}>
      {status}
    </Badge>
  );
}

export function ScanResultCard({ result, minimal = false }: ScanResultCardProps) {
  if (!result) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <ScanLine className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">Scan a QR code to check in</p>
        </CardContent>
      </Card>
    );
  }

  const config = {
    checked_in: {
      bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
      icon: <CheckCircle2 className="h-10 w-10 text-green-600" />,
      label: "Checked In",
      badgeVariant: "default" as const,
    },
    already_checked_in: {
      bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
      icon: <AlertTriangle className="h-10 w-10 text-amber-600" />,
      label: "Already Checked In",
      badgeVariant: "secondary" as const,
    },
    checked_out: {
      bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
      icon: <CheckCircle2 className="h-10 w-10 text-blue-600" />,
      label: "Checked Out",
      badgeVariant: "default" as const,
    },
    already_checked_out: {
      bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
      icon: <AlertTriangle className="h-10 w-10 text-amber-600" />,
      label: "Already Checked Out",
      badgeVariant: "secondary" as const,
    },
    error: {
      bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
      icon: <XCircle className="h-10 w-10 text-red-600" />,
      label: result.errorMessage || "Error",
      badgeVariant: "destructive" as const,
    },
  }[result.status];

  const person = result.person;
  const registration = result.registration;
  const confirmationCode = registration?.confirmationCode ?? result.confirmationCode;
  const participantCode = person?.participantCode;

  // Show the line banner for any successful main check-in (not errors, not
  // dining scans). Pending/optimistic previews still show it so operators can
  // route immediately without waiting for the server round-trip.
  const showLine =
    result.status !== "error" && result.checkinType !== "DINING";
  const line = resolveCheckinLine(registration?.status);

  // On Site (unpaid) passes are inactive by nature, so don't flag it — that's
  // expected, not a problem. Only surface "E-Pass Inactive" for paid/Fast Track
  // passes, where an inactive pass is a real anomaly worth flagging.
  const showInactive = person?.isEpassActive === false && line !== "on_site";

  return (
    <Card className={config.bg}>
      <CardContent
        className={
          minimal
            ? "px-3 py-3"
            : "flex items-start gap-4 py-5"
        }
      >
        {/* Minimal drops the big status icon so the line banner + name/reg
            code can use the full width from the left edge. */}
        {!minimal && <div className="shrink-0 mt-1">{config.icon}</div>}
        <div className={minimal ? "min-w-0 space-y-2" : "flex-1 min-w-0 space-y-2"}>
          {showLine && <CheckinLineBanner line={line} />}
          <div className="flex items-center gap-1.5 flex-wrap">
            {result.isPending ? (
              <Badge variant="outline" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Confirming…
              </Badge>
            ) : (
              <Badge variant={config.badgeVariant}>{config.label}</Badge>
            )}
            {result.isOffline && (
              <Badge variant="outline" className="text-xs">
                Offline
              </Badge>
            )}
            {result.isSandbox && (
              <Badge
                variant="outline"
                className="gap-1 text-xs border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-300"
              >
                <Beaker className="h-3 w-3" /> Sandbox
              </Badge>
            )}
            {showInactive && (
              <Badge variant="destructive" className="text-xs">
                E-Pass Inactive
              </Badge>
            )}
          </div>

          {minimal ? (
            // Phone-first: reg code first (bold) + name (regular) on one line,
            // no labels.
            (person || confirmationCode) && (
              <div className="flex items-baseline gap-3">
                {confirmationCode && (
                  <p className="font-mono tracking-wider text-xl font-bold shrink-0">
                    {confirmationCode}
                  </p>
                )}
                {person && (
                  <p className="text-xl font-normal truncate min-w-0">
                    {person.name}
                  </p>
                )}
              </div>
            )
          ) : (
            <>
              {person && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
                    Legal Name
                  </p>
                  <p className="text-xl font-bold truncate">{person.name}</p>
                  {person.koreanName && (
                    <p className="text-base text-muted-foreground truncate">
                      {person.koreanName}
                    </p>
                  )}
                </div>
              )}

              {(confirmationCode || participantCode) && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {confirmationCode && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
                        Reg ID
                      </p>
                      <p className="font-mono tracking-wider">
                        {confirmationCode}
                      </p>
                    </div>
                  )}
                  {participantCode && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
                        Participant ID
                      </p>
                      <p className="font-mono tracking-wider">
                        {participantCode}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {!minimal &&
            (registration?.status || person?.gender || person?.mealCategory) && (
              <div className="flex flex-wrap items-center gap-1.5">
                <RegistrationStatusBadge status={registration?.status} />
                <GenderBadge gender={person?.gender} />
                <MealCategoryBadge category={person?.mealCategory ?? null} />
              </div>
            )}

          {!minimal && result.mealType && (
            <p className="text-sm text-muted-foreground">
              {result.mealDate} &middot; {result.mealType}
            </p>
          )}

          {!minimal && result.checkedInAt && (
            <p className="text-xs text-muted-foreground">
              In: {new Date(result.checkedInAt).toLocaleTimeString()}
              {result.checkedOutAt &&
                ` · Out: ${new Date(result.checkedOutAt).toLocaleTimeString()}`}
            </p>
          )}

          {!minimal &&
            typeof result.totalCount === "number" &&
            result.status !== "error" && (
              <div className="flex items-center gap-1.5 pt-1 border-t text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span>
                  Total checked in:{" "}
                  <span className="font-semibold text-foreground">
                    {result.totalCount}
                  </span>
                </span>
              </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
