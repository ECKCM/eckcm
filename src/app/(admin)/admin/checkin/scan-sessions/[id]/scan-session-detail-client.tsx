"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CircleDot,
  Pause,
  Square,
  Beaker,
  RefreshCw,
  Loader2,
  Play,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import {
  realtimeCheckinToScanResult,
  useRealtimeCheckins,
} from "@/lib/checkin/use-realtime-checkins";
import { RecentCheckins } from "@/components/checkin/recent-checkins";
import type { ScanSession } from "@/lib/types/checkin";

function StatusBadge({ status }: { status: ScanSession["status"] }) {
  if (status === "ACTIVE") {
    return (
      <Badge className="gap-1 bg-green-600 hover:bg-green-700">
        <CircleDot className="h-3 w-3 animate-pulse" /> Active
      </Badge>
    );
  }
  if (status === "PAUSED") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Pause className="h-3 w-3" /> Paused
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Square className="h-3 w-3" /> Ended
    </Badge>
  );
}

export function ScanSessionDetailClient({
  initialSession,
}: {
  initialSession: ScanSession;
}) {
  const [session, setSession] = useState<ScanSession>(initialSession);
  const [loading, setLoading] = useState(false);

  const refreshSession = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/scan-sessions/${session.id}`);
      if (res.ok) {
        const data = await res.json();
        setSession(data.scanSession);
      }
    } finally {
      setLoading(false);
    }
  };

  const realtime = useRealtimeCheckins({
    eventId: session.event_id,
    scanSessionId: session.id,
    // A single busy meal can exceed 400 check-ins; pull them all so the count
    // shown here matches the rows recorded under this session (the API caps
    // session-scoped reads high — see /api/checkin/recent).
    limit: 2000,
    enabled: true,
  });

  // For meal sessions, the rows recorded under THIS session are usually only
  // part of the meal — a meal often spans several sessions (kiosk restarts,
  // multiple devices). Pull the authoritative meal-wide total so the operator
  // can see "this session: N · whole meal: M" instead of mistaking one
  // session's partial count for the real headcount.
  const mealType = (() => {
    if (session.kind === "MEAL_BREAKFAST") return "BREAKFAST";
    if (session.kind === "MEAL_LUNCH") return "LUNCH";
    if (session.kind === "MEAL_DINNER") return "DINNER";
    return null;
  })();
  const [mealTotal, setMealTotal] = useState<number | null>(null);
  useEffect(() => {
    if (!mealType || !session.meal_date || session.is_sandbox) return;
    let cancelled = false;
    const pull = () => {
      const params = new URLSearchParams({
        eventId: session.event_id,
        mealDate: session.meal_date!,
        mealType,
      });
      fetch(`/api/checkin/meal-stats?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d?.meal) setMealTotal(d.meal.total);
        })
        .catch(() => {});
    };
    pull();
    // Keep it fresh while the session is live (other devices add to the meal).
    const t =
      session.status === "ENDED" ? null : setInterval(pull, 15000);
    return () => {
      cancelled = true;
      if (t) clearInterval(t);
    };
  }, [mealType, session.meal_date, session.event_id, session.is_sandbox, session.status]);

  // Keep the session status fresh while it's still active.
  useEffect(() => {
    if (session.status === "ENDED") return;
    const t = setInterval(refreshSession, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status]);

  const transition = async (action: "pause" | "resume" | "end") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/scan-sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) setSession(data.scanSession);
    } finally {
      setLoading(false);
    }
  };

  const recentResults = useMemo(
    () => realtime.checkins.map(realtimeCheckinToScanResult),
    [realtime.checkins]
  );

  const durationMs = session.ended_at
    ? new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()
    : Date.now() - new Date(session.started_at).getTime();

  const durationLabel = (() => {
    const totalMin = Math.floor(durationMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  })();

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 px-4 flex flex-wrap items-center gap-3">
          <StatusBadge status={session.status} />
          {session.is_sandbox && (
            <Badge variant="outline" className="gap-1 border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-300">
              <Beaker className="h-3 w-3" /> Sandbox
            </Badge>
          )}
          <Badge variant="secondary">{session.kind.replace(/_/g, " ")}</Badge>
          {session.meal_date && (
            <Badge variant="outline">{session.meal_date}</Badge>
          )}
          <div className="text-sm text-muted-foreground">
            Started {new Date(session.started_at).toLocaleString()}
            {session.ended_at && (
              <> · Ended {new Date(session.ended_at).toLocaleString()}</>
            )}
            <> · {durationLabel}</>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {session.status === "ACTIVE" && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => transition("pause")}
                disabled={loading}
              >
                <Pause className="h-4 w-4 mr-1" /> Pause
              </Button>
            )}
            {session.status === "PAUSED" && (
              <Button
                size="sm"
                onClick={() => transition("resume")}
                disabled={loading}
              >
                <Play className="h-4 w-4 mr-1" /> Resume
              </Button>
            )}
            {session.status !== "ENDED" && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => transition("end")}
                disabled={loading}
              >
                <Square className="h-4 w-4 mr-1" /> End
              </Button>
            )}
            {/* Export — Excel is the UPJ default, CSV is a fallback for
                non-Excel tooling. The .xlsx ships with a Summary sheet of
                tier totals so UPJ can glance the headcount without a pivot. */}
            <Button asChild size="sm" variant="default">
              <a href={`/api/scan-sessions/${session.id}/export?format=xlsx`}>
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`/api/scan-sessions/${session.id}/export?format=csv`}>
                <FileText className="h-4 w-4 mr-1" /> CSV
              </a>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={refreshSession}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <CardTitle className="text-base">
              This session ({recentResults.length})
            </CardTitle>
            {mealTotal !== null && mealTotal !== recentResults.length && (
              <span className="text-sm text-muted-foreground">
                Whole meal total:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {mealTotal}
                </span>{" "}
                across all sessions
              </span>
            )}
          </div>
          {session.status !== "ENDED" && (
            <Badge variant="outline" className="gap-1">
              <CircleDot className="h-3 w-3 animate-pulse text-green-600" />
              Live
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <RecentCheckins checkins={recentResults} />
        </CardContent>
      </Card>
    </div>
  );
}
