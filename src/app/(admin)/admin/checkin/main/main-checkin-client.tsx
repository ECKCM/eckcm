"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ScanResultCard,
  type ScanResult,
} from "@/components/checkin/scan-result-card";
import { RecentCheckins } from "@/components/checkin/recent-checkins";
import { ScannerShell } from "@/components/checkin/scanner-shell";
import { CacheStatusBar } from "@/components/checkin/cache-status-bar";
import { feedback } from "@/lib/checkin/scanner-feedback";
import { toVerifyBody, type ParsedQR } from "@/lib/checkin/qr-parser";
import { useEpassCache } from "@/lib/checkin/use-epass-cache";
import {
  addPendingCheckin,
  getPendingCheckins,
  clearPendingCheckins,
  addCheckinLog,
  getRecentLogs,
  getPendingCount,
} from "@/lib/checkin/offline-store";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

interface MainCheckinClientProps {
  events: EventOption[];
}

const RESUME_DELAY_MS = 3000;

export function MainCheckinClient({ events }: MainCheckinClientProps) {
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [recentCheckins, setRecentCheckins] = useState<ScanResult[]>([]);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Offline cache: auto-loads when event changes, auto-refreshes when new
  // registrations come in via realtime, and is used for instant scan preview.
  const cache = useEpassCache({ eventId: selectedEventId || null });

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    getRecentLogs(30).then((logs) => {
      setRecentCheckins(
        logs
          .filter((l) => l.checkinType === "MAIN")
          .map((l) => ({
            status: l.status,
            person: { name: l.personName, koreanName: l.koreanName },
            confirmationCode: l.confirmationCode ?? undefined,
            errorMessage: l.errorMessage,
            checkinType: l.checkinType,
            timestamp: new Date(l.timestamp),
            isOffline: l.isOffline,
          }))
      );
    });
    getPendingCount().then(setPendingSyncCount);
  }, []);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const syncPendingCheckins = useCallback(async () => {
    setSyncing(true);
    try {
      const pending = await getPendingCheckins();
      if (pending.length === 0) {
        setPendingSyncCount(0);
        return;
      }
      const res = await fetch("/api/checkin/batch-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkins: pending.map((p) => ({
            ...(p.token.startsWith("pc:")
              ? { participantCode: p.token.slice(3) }
              : { token: p.token }),
            checkinType: p.checkinType,
            sessionId: p.sessionId,
            nonce: p.nonce,
            timestamp: p.timestamp,
          })),
        }),
      });
      if (res.ok) {
        const { results } = await res.json();
        const successIds = pending
          .filter((p) => {
            const r = results.find((r: { nonce: string }) => r.nonce === p.nonce);
            return r && r.status !== "error";
          })
          .map((p) => p.id!)
          .filter(Boolean);
        if (successIds.length > 0) await clearPendingCheckins(successIds);
      }
      setPendingSyncCount(await getPendingCount());
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (isOnline && pendingSyncCount > 0) {
      syncPendingCheckins();
    }
  }, [isOnline, pendingSyncCount, syncPendingCheckins]);

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
      setScanning(true);
      setScanResult(null);
    }, RESUME_DELAY_MS);
  }, []);

  const handleOfflineScan = useCallback(
    async (parsed: ParsedQR): Promise<ScanResult> => {
      const cached = await cache.lookup(parsed);
      if (!cached) {
        return {
          status: "error",
          errorMessage: "Not found in cache",
          timestamp: new Date(),
          isOffline: true,
        };
      }
      if (!cached.isActive) {
        return {
          status: "error",
          person: { name: cached.personName, koreanName: cached.koreanName },
          errorMessage: "E-Pass is inactive",
          timestamp: new Date(),
          isOffline: true,
        };
      }
      if (cached.registrationStatus !== "PAID") {
        return {
          status: "error",
          person: { name: cached.personName, koreanName: cached.koreanName },
          errorMessage: "Registration is not paid",
          timestamp: new Date(),
          isOffline: true,
        };
      }

      const nonce = crypto.randomUUID();
      const signed =
        parsed.kind === "participantCode"
          ? `pc:${cached.signedCode ?? parsed.participantCode}`
          : parsed.token;
      await addPendingCheckin({
        token: signed,
        checkinType: "MAIN",
        sessionId: null,
        timestamp: new Date().toISOString(),
        nonce,
      });
      setPendingSyncCount((prev) => prev + 1);

      return {
        status: "checked_in",
        person: {
          name: cached.personName,
          koreanName: cached.koreanName,
          participantCode: cached.participantCode,
        },
        confirmationCode: cached.confirmationCode,
        checkinType: "MAIN",
        timestamp: new Date(),
        isOffline: true,
      };
    },
    [cache]
  );

  const handleScan = useCallback(
    async (parsed: ParsedQR) => {
      setProcessing(true);
      setScanning(false);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);

      // 1. Cache-first preview — renders the name instantly while the
      //    server verify call completes. Status stays pending until verify.
      const cached = await cache.lookup(parsed);
      if (cached) {
        setScanResult({
          status: "checked_in",
          person: {
            name: cached.personName,
            koreanName: cached.koreanName,
            participantCode: cached.participantCode,
          },
          confirmationCode: cached.confirmationCode,
          checkinType: "MAIN",
          timestamp: new Date(),
          isPending: true,
        });
        feedback("success");
      }

      let result: ScanResult;

      if (isOnline) {
        try {
          const res = await fetch("/api/checkin/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...toVerifyBody(parsed),
              checkinType: "MAIN",
            }),
          });
          const data = await res.json();
          if (res.ok) {
            result = {
              status: data.status,
              person: data.person,
              registration: data.registration,
              confirmationCode: data.confirmationCode,
              checkinType: data.checkinType,
              isSandbox: data.isSandbox,
              timestamp: new Date(),
              isOffline: false,
            };
          } else if (res.status === 403 || res.status === 404) {
            result = {
              status: "error",
              person: data.person,
              registration: data.registration,
              errorMessage: data.error,
              timestamp: new Date(),
            };
          } else {
            result = {
              status: "error",
              errorMessage: data.error || "Check-in failed",
              timestamp: new Date(),
            };
          }
        } catch {
          result = await handleOfflineScan(parsed);
        }
      } else {
        result = await handleOfflineScan(parsed);
      }

      // Only fire feedback again on the *final* status if cache didn't already
      // (or if the final status is an error that overrides the optimistic beep).
      if (!cached || result.status === "error") {
        const tone =
          result.status === "checked_in" || result.status === "checked_out"
            ? "success"
            : result.status === "error"
              ? "error"
              : "warn";
        feedback(tone);
      } else if (result.status === "already_checked_in") {
        // Optimistic was a success beep — correct it to "warn".
        feedback("warn");
      }

      setScanResult(result);
      setRecentCheckins((prev) => [result, ...prev].slice(0, 30));

      await addCheckinLog({
        personName: result.person?.name ?? "Unknown",
        koreanName: result.person?.koreanName ?? null,
        confirmationCode:
          result.registration?.confirmationCode ?? result.confirmationCode ?? null,
        status: result.status,
        checkinType: "MAIN",
        timestamp: result.timestamp.toISOString(),
        isOffline: result.isOffline ?? false,
        errorMessage: result.errorMessage,
      });

      setProcessing(false);
      startResumeCountdown();
    },
    [isOnline, cache, handleOfflineScan, startResumeCountdown]
  );

  const handleScanningChange = useCallback((next: boolean) => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setResumeCountdown(null);
    setScanning(next);
    if (next) setScanResult(null);
  }, []);

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
      </div>

      <CacheStatusBar
        status={cache.status}
        count={cache.count}
        onResync={cache.refresh}
        pendingSyncCount={pendingSyncCount}
        onSyncPending={syncPendingCheckins}
        syncing={syncing}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <ScannerShell
            onScan={handleScan}
            scanning={scanning}
            onScanningChange={handleScanningChange}
            processing={processing}
            resumeCountdown={resumeCountdown}
            defaultCameraFacing="environment"
            cameraStorageNamespace="main"
          />
          <ScanResultCard result={scanResult} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Check-ins</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentCheckins checkins={recentCheckins} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
