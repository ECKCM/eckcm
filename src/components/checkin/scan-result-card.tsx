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

export function ScanResultCard({ result }: ScanResultCardProps) {
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
  const showInactive = person?.isEpassActive === false;

  return (
    <Card className={config.bg}>
      <CardContent className="flex items-start gap-4 py-5">
        <div className="shrink-0 mt-1">{config.icon}</div>
        <div className="flex-1 min-w-0 space-y-2">
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
                  <p className="font-mono tracking-wider">{confirmationCode}</p>
                </div>
              )}
              {participantCode && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
                    Participant ID
                  </p>
                  <p className="font-mono tracking-wider">{participantCode}</p>
                </div>
              )}
            </div>
          )}

          {(registration?.status || person?.gender || person?.mealCategory) && (
            <div className="flex flex-wrap items-center gap-1.5">
              <RegistrationStatusBadge status={registration?.status} />
              <GenderBadge gender={person?.gender} />
              <MealCategoryBadge category={person?.mealCategory ?? null} />
            </div>
          )}

          {result.mealType && (
            <p className="text-sm text-muted-foreground">
              {result.mealDate} &middot; {result.mealType}
            </p>
          )}

          {result.checkedInAt && (
            <p className="text-xs text-muted-foreground">
              In: {new Date(result.checkedInAt).toLocaleTimeString()}
              {result.checkedOutAt &&
                ` · Out: ${new Date(result.checkedOutAt).toLocaleTimeString()}`}
            </p>
          )}

          {typeof result.totalCount === "number" && result.status !== "error" && (
            <div className="flex items-center gap-1.5 pt-1 border-t text-sm text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              <span>
                Total checked in:{" "}
                <span className="font-semibold text-foreground">{result.totalCount}</span>
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
