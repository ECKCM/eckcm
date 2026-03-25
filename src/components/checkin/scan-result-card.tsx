"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, ScanLine } from "lucide-react";

export interface ScanResult {
  status: "checked_in" | "already_checked_in" | "checked_out" | "already_checked_out" | "error";
  person?: { name: string; koreanName?: string | null };
  confirmationCode?: string;
  errorMessage?: string;
  checkinType?: string;
  mealType?: string;
  mealDate?: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  timestamp: Date;
  isOffline?: boolean;
}

interface ScanResultCardProps {
  result: ScanResult | null;
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

  const configMap: Record<string, { bg: string; icon: React.ReactNode; label: string; badgeVariant: "default" | "secondary" | "destructive" }> = {
    checked_in: {
      bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
      icon: <CheckCircle2 className="h-10 w-10 text-green-600" />,
      label: "Checked In",
      badgeVariant: "default",
    },
    already_checked_in: {
      bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
      icon: <AlertTriangle className="h-10 w-10 text-amber-600" />,
      label: "Already Checked In",
      badgeVariant: "secondary",
    },
    checked_out: {
      bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
      icon: <CheckCircle2 className="h-10 w-10 text-blue-600" />,
      label: "Checked Out",
      badgeVariant: "default",
    },
    already_checked_out: {
      bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
      icon: <AlertTriangle className="h-10 w-10 text-amber-600" />,
      label: "Already Checked Out",
      badgeVariant: "secondary",
    },
    error: {
      bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
      icon: <XCircle className="h-10 w-10 text-red-600" />,
      label: result.errorMessage || "Error",
      badgeVariant: "destructive",
    },
  };
  const config = configMap[result.status];

  return (
    <Card className={config.bg}>
      <CardContent className="flex items-start gap-4 py-5">
        <div className="shrink-0 mt-1">{config.icon}</div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={config.badgeVariant}>{config.label}</Badge>
            {result.isOffline && (
              <Badge variant="outline" className="text-xs">
                Offline
              </Badge>
            )}
          </div>
          {result.person && (
            <p className="text-xl font-bold truncate">{result.person.name}</p>
          )}
          {result.person?.koreanName && (
            <p className="text-base text-muted-foreground">
              {result.person.koreanName}
            </p>
          )}
          {result.mealType && (
            <p className="text-sm text-muted-foreground">
              {result.mealDate} &middot; {result.mealType}
            </p>
          )}
          {result.confirmationCode && (
            <p className="font-mono text-sm tracking-wider text-muted-foreground">
              {result.confirmationCode}
            </p>
          )}
          {result.checkedInAt && (
            <p className="text-xs text-muted-foreground">
              In: {new Date(result.checkedInAt).toLocaleTimeString()}
              {result.checkedOutAt && ` · Out: ${new Date(result.checkedOutAt).toLocaleTimeString()}`}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
