"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScanLine, Users, Calendar, Clock } from "lucide-react";
import {
  ScanResultCard,
  type ScanResult,
} from "@/components/checkin/scan-result-card";
import { RecentCheckins } from "@/components/checkin/recent-checkins";
import { ScannerShell } from "@/components/checkin/scanner-shell";
import { ScanSessionControls } from "@/components/checkin/scan-session-controls";
import { CacheStatusBar } from "@/components/checkin/cache-status-bar";
import { feedback } from "@/lib/checkin/scanner-feedback";
import { toVerifyBody, type ParsedQR } from "@/lib/checkin/qr-parser";
import { useScanSession } from "@/lib/checkin/use-scan-session";
import { useEpassCache } from "@/lib/checkin/use-epass-cache";
import {
  realtimeCheckinToScanResult,
  useRealtimeCheckins,
} from "@/lib/checkin/use-realtime-checkins";

interface Session {
  id: string;
  event_id: string;
  name_en: string;
  name_ko: string | null;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  is_active: boolean;
}

export function SessionDashboardClient({
  session,
  initialCheckinCount,
}: {
  session: Session;
  initialCheckinCount: number;
}) {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [scannerLive, setScannerLive] = useState(true);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const scanSession = useScanSession({
    storageKey: `checkin.scanSessionId.session.${session.id}`,
  });
  const cache = useEpassCache({ eventId: session.event_id });

  // Detach if it's not for this content session.
  useEffect(() => {
    if (
      scanSession.session &&
      scanSession.session.session_id !== session.id
    ) {
      scanSession.detach();
    }
  }, [session.id, scanSession]);

  const realtime = useRealtimeCheckins({
    eventId: session.event_id,
    scanSessionId: scanSession.session?.id ?? null,
    checkinType: "SESSION",
    limit: 50,
    enabled: Boolean(scanSession.session),
  });

  const recentResults = useMemo(
    () => realtime.checkins.map(realtimeCheckinToScanResult),
    [realtime.checkins]
  );

  const totalCount =
    realtime.checkins.length > 0 ? realtime.checkins.length : initialCheckinCount;

  const handleStart = useCallback(async () => {
    await scanSession.start({
      eventId: session.event_id,
      kind: "SESSION",
      sessionId: session.id,
      label: session.name_en,
    });
    setScannerLive(true);
  }, [scanSession, session.event_id, session.id, session.name_en]);

  const startResumeCountdown = useCallback(() => {
    setResumeCountdown(3);
    countdownRef.current = setInterval(() => {
      setResumeCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    resumeTimerRef.current = setTimeout(() => {
      setScannerLive(true);
      setScanResult(null);
    }, 3000);
  }, []);

  const handleScan = useCallback(
    async (parsed: ParsedQR) => {
      if (!scanSession.canScan || !scanSession.session) return;
      setProcessing(true);
      setScannerLive(false);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);

      let result: ScanResult;
      try {
        const res = await fetch("/api/checkin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...toVerifyBody(parsed),
            checkinType: "SESSION",
            sessionId: session.id,
            scanSessionId: scanSession.session.id,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          result = {
            status: data.status,
            person: data.person,
            registration: data.registration,
            confirmationCode: data.confirmationCode,
            checkinType: "SESSION",
            totalCount: data.totalCount,
            timestamp: new Date(),
            isOffline: false,
          };
        } else {
          result = {
            status: "error",
            person: data.person,
            registration: data.registration,
            errorMessage: data.error || "Session check-in failed",
            timestamp: new Date(),
            isOffline: false,
          };
        }
      } catch {
        result = {
          status: "error",
          errorMessage: "Network error",
          timestamp: new Date(),
          isOffline: true,
        };
      }

      const tone =
        result.status === "checked_in"
          ? "success"
          : result.status === "error"
            ? "error"
            : "warn";
      feedback(tone);
      setScanResult(result);
      setProcessing(false);
      startResumeCountdown();
    },
    [scanSession.canScan, scanSession.session, session.id, startResumeCountdown]
  );

  const sessionActive = scanSession.canScan;
  const disabledReason = !scanSession.session
    ? "Start a scan session to enable check-ins"
    : scanSession.status === "PAUSED"
      ? "Session paused"
      : scanSession.status === "ENDED"
        ? "Session ended"
        : undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-medium">{session.session_date}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Time</p>
              <p className="font-medium">
                {session.start_time && session.end_time
                  ? `${session.start_time} - ${session.end_time}`
                  : "Not set"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Checked In</p>
              <p className="font-medium text-lg">{totalCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <CacheStatusBar
        status={cache.status}
        count={cache.count}
        onResync={cache.refresh}
      />

      <ScanSessionControls
        session={scanSession.session}
        loading={scanSession.loading}
        startLabel="Start session scanning"
        onStart={handleStart}
        onPause={scanSession.pause}
        onResume={scanSession.resume}
        onEnd={scanSession.end}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ScanLine className="h-4 w-4" />
                  QR Scanner
                </CardTitle>
                <Badge variant={session.is_active ? "default" : "secondary"}>
                  {session.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ScannerShell
                onScan={handleScan}
                scanning={scannerLive && sessionActive}
                onScanningChange={setScannerLive}
                processing={processing}
                resumeCountdown={resumeCountdown}
                disabled={!sessionActive}
                disabledReason={disabledReason}
                defaultCameraFacing="environment"
                cameraStorageNamespace={`session-${session.id}`}
              />
            </CardContent>
          </Card>
          <ScanResultCard result={scanResult} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Session Check-ins</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentCheckins checkins={recentResults} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
