"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Play,
  Pause,
  Square,
  CircleDot,
  Beaker,
  Loader2,
} from "lucide-react";
import type { ScanSession } from "@/lib/types/checkin";

interface ScanSessionControlsProps {
  session: ScanSession | null;
  loading?: boolean;
  /** Called when the operator clicks "Start" — parent provides start args. */
  onStart: () => unknown;
  onPause: () => unknown;
  onResume: () => unknown;
  onEnd: () => unknown;
  /** Show a banner explaining why scanning is currently disabled. */
  inactiveHint?: string;
  /** Optional disable for the Start button (e.g., missing meal date). */
  startDisabled?: boolean;
  startLabel?: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: ScanSession["status"] }) {
  if (status === "ACTIVE") {
    return (
      <Badge className="gap-1 bg-green-600 hover:bg-green-700">
        <CircleDot className="h-3 w-3 animate-pulse" />
        Active
      </Badge>
    );
  }
  if (status === "PAUSED") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Pause className="h-3 w-3" />
        Paused
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Square className="h-3 w-3" />
      Ended
    </Badge>
  );
}

/**
 * Operator-facing controls for the scan-session lifecycle. Renders different
 * states based on whether a session exists yet:
 *
 *   - No session         → big "Start scanning session" button
 *   - ACTIVE             → status badge + Pause + End buttons
 *   - PAUSED             → status badge + Resume + End buttons
 *   - ENDED              → status badge + "Start new session" button
 */
export function ScanSessionControls({
  session,
  loading,
  onStart,
  onPause,
  onResume,
  onEnd,
  inactiveHint,
  startDisabled,
  startLabel = "Start scanning session",
}: ScanSessionControlsProps) {
  if (!session || session.status === "ENDED") {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-3 py-4">
          <div className="flex-1">
            <p className="font-medium">No active scan session</p>
            <p className="text-sm text-muted-foreground">
              {inactiveHint ??
                "Start a session to enable scanning. All scans during this session are grouped together for review."}
            </p>
          </div>
          <Button
            onClick={() => onStart()}
            disabled={loading || startDisabled}
            size="lg"
            className="gap-2 shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {startLabel}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-3 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={session.status} />
            {session.is_sandbox && (
              <Badge variant="outline" className="gap-1 border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-300">
                <Beaker className="h-3 w-3" />
                Sandbox
              </Badge>
            )}
            {session.label && (
              <span className="text-sm text-muted-foreground">
                {session.label}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Started {formatTime(session.started_at)}
            {session.paused_at && session.status === "PAUSED" && (
              <> · Paused {formatTime(session.paused_at)}</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {session.status === "ACTIVE" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPause()}
              disabled={loading}
              className="gap-1.5"
            >
              <Pause className="h-4 w-4" /> Pause
            </Button>
          )}
          {session.status === "PAUSED" && (
            <Button
              size="sm"
              onClick={() => onResume()}
              disabled={loading}
              className="gap-1.5"
            >
              <Play className="h-4 w-4" /> Resume
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={loading}
                className="gap-1.5"
              >
                <Square className="h-4 w-4" /> End
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>End this scan session?</AlertDialogTitle>
                <AlertDialogDescription>
                  Scanning will stop and the session will be finalized. Admins
                  can still view the check-ins recorded during it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onEnd()}>
                  End session
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
