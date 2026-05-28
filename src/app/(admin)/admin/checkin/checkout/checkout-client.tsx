"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScanLine, Users, LogOut } from "lucide-react";
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

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

export function CheckoutClient({ events }: { events: EventOption[] }) {
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [scannerLive, setScannerLive] = useState(true);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const [checkoutsLocally, setCheckoutsLocally] = useState(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const scanSession = useScanSession({ storageKey: "checkin.scanSessionId.checkout" });
  const cache = useEpassCache({ eventId: selectedEventId || null });

  // Detach a stale stored session belonging to a different event.
  useEffect(() => {
    if (
      scanSession.session &&
      scanSession.session.event_id !== selectedEventId
    ) {
      scanSession.detach();
    }
  }, [selectedEventId, scanSession]);

  const realtime = useRealtimeCheckins({
    eventId: selectedEventId || null,
    checkinType: "MAIN",
    limit: 50,
    enabled: Boolean(scanSession.session),
  });

  // Show only rows that have been checked OUT in the recent list — others are
  // still arrivals, not checkouts.
  const recentResults = useMemo(
    () =>
      realtime.checkins
        .filter((c) => c.checkedOutAt)
        .map(realtimeCheckinToScanResult),
    [realtime.checkins]
  );

  const handleStart = useCallback(async () => {
    if (!selectedEventId) return;
    await scanSession.start({
      eventId: selectedEventId,
      kind: "CHECKOUT",
      label: "Check-out",
    });
    setScannerLive(true);
  }, [scanSession, selectedEventId]);

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
        const res = await fetch("/api/checkin/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...toVerifyBody(parsed),
            scanSessionId: scanSession.session.id,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          result = {
            status: data.status,
            person: data.person,
            confirmationCode: data.confirmationCode,
            checkinType: "CHECKOUT",
            checkedInAt: data.checkedInAt,
            checkedOutAt: data.checkedOutAt,
            timestamp: new Date(),
            isOffline: false,
          };
          if (data.status === "checked_out") {
            setCheckoutsLocally((prev) => prev + 1);
          }
        } else {
          result = {
            status: "error",
            person: data.person,
            errorMessage: data.error || "Check-out failed",
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
        result.status === "checked_out"
          ? "success"
          : result.status === "error"
            ? "error"
            : "warn";
      feedback(tone);
      setScanResult(result);
      setProcessing(false);
      startResumeCountdown();
    },
    [scanSession.canScan, scanSession.session, startResumeCountdown]
  );

  const sessionActive = scanSession.canScan;
  const disabledReason = !scanSession.session
    ? "Start a check-out session to enable scanning"
    : scanSession.status === "PAUSED"
      ? "Session paused"
      : scanSession.status === "ENDED"
        ? "Session ended"
        : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
          <SelectTrigger className="w-full sm:w-[260px]">
            <SelectValue placeholder="Select event" />
          </SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name_en} ({e.year})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="outline" className="gap-1.5 px-3 py-2 text-sm self-start">
          <LogOut className="h-4 w-4" />
          Check-out Mode
        </Badge>
      </div>

      <CacheStatusBar
        status={cache.status}
        count={cache.count}
        onResync={cache.refresh}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <LogOut className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Session check-outs</p>
              <p className="font-medium text-lg">{checkoutsLocally}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Live total</p>
              <p className="font-medium text-lg">{recentResults.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <ScanSessionControls
        session={scanSession.session}
        loading={scanSession.loading}
        startLabel="Start check-out session"
        startDisabled={!selectedEventId}
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
                  Check-out Scanner
                </CardTitle>
                <Badge variant="secondary">
                  <LogOut className="h-3 w-3 mr-1" /> Out
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
                cameraStorageNamespace="checkout"
              />
            </CardContent>
          </Card>
          <ScanResultCard result={scanResult} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Check-outs</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentCheckins checkins={recentResults} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
