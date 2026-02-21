"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import {
  ScanResultCard,
  type ScanResult,
} from "@/components/checkin/scan-result-card";
import { RecentCheckins } from "@/components/checkin/recent-checkins";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Wifi,
  WifiOff,
  Database,
  RefreshCw,
  Pause,
  Play,
  Loader2,
} from "lucide-react";
import {
  cacheEPassData,
  lookupToken,
  addPendingCheckin,
  getPendingCheckins,
  clearPendingCheckins,
  addCheckinLog,
  getRecentLogs,
  getPendingCount,
  getCacheCount,
} from "@/lib/checkin/offline-store";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

interface CheckinScannerProps {
  events: EventOption[];
}

function extractTokenFromQR(scannedValue: string): string | null {
  const urlMatch = scannedValue.match(/\/epass\/([A-Za-z0-9_-]{20,})/);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9_-]{20,40}$/.test(scannedValue)) return scannedValue;
  return null;
}

function playBeep(success: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = success ? 800 : 300;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + (success ? 0.15 : 0.3));
  } catch {
    // Audio not available
  }
}

function vibrate(success: boolean) {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(success ? 100 : [100, 50, 100]);
    }
  } catch {
    // Vibration not available
  }
}

export function CheckinScanner({ events }: CheckinScannerProps) {
  const [selectedEventId, setSelectedEventId] = useState(
    events[0]?.id ?? ""
  );
  const [checkinType, setCheckinType] = useState<"MAIN" | "DINING" | "SESSION">(
    "MAIN"
  );
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [recentCheckins, setRecentCheckins] = useState<ScanResult[]>([]);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [cacheStatus, setCacheStatus] = useState<
    "none" | "loading" | "ready" | "error"
  >("none");
  const [cacheCount, setCacheCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastScannedRef = useRef<string | null>(null);

  // Online/offline detection
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Load recent logs from IndexedDB on mount
  useEffect(() => {
    getRecentLogs(30).then((logs) => {
      setRecentCheckins(
        logs.map((l) => ({
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
    getCacheCount().then(setCacheCount);
  }, []);

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline && pendingSyncCount > 0) {
      syncPendingCheckins();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // Wake lock
  useEffect(() => {
    async function requestWakeLock() {
      if (scanning && "wakeLock" in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        } catch {
          // Wake lock not available
        }
      }
    }
    requestWakeLock();
    return () => {
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [scanning]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Load E-Pass cache when event changes
  useEffect(() => {
    if (!selectedEventId) return;
    loadCache(selectedEventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  async function loadCache(eventId: string) {
    setCacheStatus("loading");
    try {
      const res = await fetch(
        `/api/checkin/epass-cache?eventId=${eventId}`
      );
      if (!res.ok) throw new Error("Failed to fetch cache");
      const data = await res.json();
      await cacheEPassData(data.tokens);
      setCacheCount(data.tokens.length);
      setCacheStatus("ready");
    } catch {
      setCacheStatus("error");
    }
  }

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
            token: p.token,
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
            const r = results.find(
              (r: { nonce: string }) => r.nonce === p.nonce
            );
            return r && r.status !== "error";
          })
          .map((p) => p.id!)
          .filter(Boolean);

        if (successIds.length > 0) {
          await clearPendingCheckins(successIds);
        }
      }

      const remaining = await getPendingCount();
      setPendingSyncCount(remaining);
    } finally {
      setSyncing(false);
    }
  }, []);

  function startResumeCountdown() {
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
      lastScannedRef.current = null;
    }, 3000);
  }

  async function handleScan(detectedCodes: { rawValue: string }[]) {
    if (processing || !detectedCodes.length) return;

    const rawValue = detectedCodes[0].rawValue;
    const token = extractTokenFromQR(rawValue);

    if (!token) return;

    // Prevent duplicate rapid scans of the same token
    if (lastScannedRef.current === token) return;
    lastScannedRef.current = token;

    setProcessing(true);
    setScanning(false);

    // Clear any existing resume timer
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    let result: ScanResult;

    if (isOnline) {
      try {
        const res = await fetch("/api/checkin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            checkinType,
          }),
        });

        const data = await res.json();

        if (res.ok) {
          result = {
            status: data.status,
            person: data.person,
            confirmationCode: data.confirmationCode,
            checkinType: data.checkinType,
            timestamp: new Date(),
            isOffline: false,
          };
        } else if (res.status === 403 || res.status === 404) {
          result = {
            status: "error",
            person: data.person,
            errorMessage: data.error,
            timestamp: new Date(),
            isOffline: false,
          };
        } else {
          result = {
            status: "error",
            errorMessage: data.error || "Check-in failed",
            timestamp: new Date(),
            isOffline: false,
          };
        }
      } catch {
        // Network error - fall back to offline
        result = await handleOfflineScan(token);
      }
    } else {
      result = await handleOfflineScan(token);
    }

    const isSuccess = result.status !== "error";
    playBeep(isSuccess);
    vibrate(isSuccess);

    setScanResult(result);
    setRecentCheckins((prev) => [result, ...prev].slice(0, 30));

    // Save to local log
    await addCheckinLog({
      personName: result.person?.name ?? "Unknown",
      koreanName: result.person?.koreanName ?? null,
      confirmationCode: result.confirmationCode ?? null,
      status: result.status,
      checkinType,
      timestamp: result.timestamp.toISOString(),
      isOffline: result.isOffline ?? false,
      errorMessage: result.errorMessage,
    });

    setProcessing(false);
    startResumeCountdown();
  }

  async function handleOfflineScan(token: string): Promise<ScanResult> {
    const cached = await lookupToken(token);

    if (!cached) {
      return {
        status: "error",
        errorMessage: "Token not found in cache",
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
    await addPendingCheckin({
      token,
      checkinType,
      sessionId: null,
      timestamp: new Date().toISOString(),
      nonce,
    });
    setPendingSyncCount((prev) => prev + 1);

    return {
      status: "checked_in",
      person: { name: cached.personName, koreanName: cached.koreanName },
      confirmationCode: cached.confirmationCode,
      checkinType,
      timestamp: new Date(),
      isOffline: true,
    };
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
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

        <Tabs
          value={checkinType}
          onValueChange={(v) =>
            setCheckinType(v as "MAIN" | "DINING" | "SESSION")
          }
        >
          <TabsList>
            <TabsTrigger value="MAIN">Main</TabsTrigger>
            <TabsTrigger value="DINING">Dining</TabsTrigger>
            <TabsTrigger value="SESSION">Session</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Status Bar */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={isOnline ? "default" : "destructive"} className="gap-1">
          {isOnline ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          {isOnline ? "Online" : "Offline"}
        </Badge>

        <Badge
          variant={
            cacheStatus === "ready"
              ? "secondary"
              : cacheStatus === "error"
                ? "destructive"
                : "outline"
          }
          className="gap-1"
        >
          <Database className="h-3 w-3" />
          {cacheStatus === "loading"
            ? "Loading cache..."
            : cacheStatus === "ready"
              ? `Cache: ${cacheCount}`
              : cacheStatus === "error"
                ? "Cache error"
                : "No cache"}
        </Badge>

        {pendingSyncCount > 0 && (
          <Badge variant="outline" className="gap-1">
            <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : `${pendingSyncCount} pending`}
          </Badge>
        )}

        {pendingSyncCount > 0 && isOnline && !syncing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={syncPendingCheckins}
            className="h-6 px-2 text-xs"
          >
            Sync now
          </Button>
        )}
      </div>

      {/* Scanner + Result */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          {/* Scanner Viewport */}
          <Card>
            <CardContent className="p-0 overflow-hidden relative">
              <div className="aspect-square max-w-[400px] mx-auto">
                {scanning ? (
                  <Scanner
                    onScan={handleScan}
                    allowMultiple={false}
                    scanDelay={500}
                    components={{
                      finder: true,
                    }}
                    styles={{
                      container: {
                        width: "100%",
                        height: "100%",
                      },
                      video: {
                        objectFit: "cover" as const,
                      },
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-muted/30 gap-3">
                    {processing ? (
                      <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <Pause className="h-10 w-10 text-muted-foreground" />
                        {resumeCountdown !== null && (
                          <p className="text-sm text-muted-foreground">
                            Resuming in {resumeCountdown}s
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              {/* Scanner toggle */}
              {!processing && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute bottom-3 right-3 gap-1"
                  onClick={() => {
                    if (resumeTimerRef.current)
                      clearTimeout(resumeTimerRef.current);
                    if (countdownRef.current)
                      clearInterval(countdownRef.current);
                    setResumeCountdown(null);
                    setScanning(!scanning);
                    if (!scanning) {
                      setScanResult(null);
                      lastScannedRef.current = null;
                    }
                  }}
                >
                  {scanning ? (
                    <>
                      <Pause className="h-4 w-4" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" /> Resume
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Scan Result */}
          <ScanResultCard result={scanResult} />
        </div>

        {/* Recent Check-ins */}
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
