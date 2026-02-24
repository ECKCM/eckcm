"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import {
  ScanResultCard,
  type ScanResult,
} from "@/components/checkin/scan-result-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wifi,
  WifiOff,
  Database,
  RefreshCw,
  Minimize2,
  Maximize2,
  Loader2,
} from "lucide-react";
import {
  cacheEPassData,
  lookupToken,
  addPendingCheckin,
  getPendingCheckins,
  clearPendingCheckins,
  addCheckinLog,
  getPendingCount,
  getCacheCount,
} from "@/lib/checkin/offline-store";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
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

export function KioskCheckinClient({ events }: { events: EventOption[] }) {
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [cacheStatus, setCacheStatus] = useState<"none" | "loading" | "ready" | "error">("none");
  const [cacheCount, setCacheCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScannedRef = useRef<string | null>(null);

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

  useEffect(() => {
    getPendingCount().then(setPendingSyncCount);
    getCacheCount().then(setCacheCount);
  }, []);

  useEffect(() => {
    if (isOnline && pendingSyncCount > 0) {
      syncPending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  useEffect(() => {
    if (!selectedEventId) return;
    loadCache(selectedEventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, []);

  async function loadCache(eventId: string) {
    setCacheStatus("loading");
    try {
      const res = await fetch(`/api/checkin/epass-cache?eventId=${eventId}`);
      if (!res.ok) throw new Error("Failed to fetch cache");
      const data = await res.json();
      await cacheEPassData(data.tokens);
      setCacheCount(data.tokens.length);
      setCacheStatus("ready");
    } catch {
      setCacheStatus("error");
    }
  }

  const syncPending = useCallback(async () => {
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
            const r = results.find((r: { nonce: string }) => r.nonce === p.nonce);
            return r && r.status !== "error";
          })
          .map((p) => p.id!)
          .filter(Boolean);
        if (successIds.length > 0) await clearPendingCheckins(successIds);
      }
      const remaining = await getPendingCount();
      setPendingSyncCount(remaining);
    } finally {
      setSyncing(false);
    }
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  async function handleScan(detectedCodes: { rawValue: string }[]) {
    if (processing || !detectedCodes.length) return;
    const rawValue = detectedCodes[0].rawValue;
    const token = extractTokenFromQR(rawValue);
    if (!token) return;
    if (lastScannedRef.current === token) return;
    lastScannedRef.current = token;

    setProcessing(true);
    setScanning(false);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);

    let result: ScanResult;

    if (isOnline) {
      try {
        const res = await fetch("/api/checkin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, checkinType: "MAIN" }),
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
        } else {
          result = {
            status: "error",
            person: data.person,
            errorMessage: data.error || "Check-in failed",
            timestamp: new Date(),
            isOffline: false,
          };
        }
      } catch {
        result = await handleOffline(token);
      }
    } else {
      result = await handleOffline(token);
    }

    playBeep(result.status !== "error");
    setScanResult(result);

    await addCheckinLog({
      personName: result.person?.name ?? "Unknown",
      koreanName: result.person?.koreanName ?? null,
      confirmationCode: result.confirmationCode ?? null,
      status: result.status,
      checkinType: "MAIN",
      timestamp: result.timestamp.toISOString(),
      isOffline: result.isOffline ?? false,
      errorMessage: result.errorMessage,
    });

    setProcessing(false);
    resumeTimerRef.current = setTimeout(() => {
      setScanning(true);
      setScanResult(null);
      lastScannedRef.current = null;
    }, 3000);
  }

  async function handleOffline(token: string): Promise<ScanResult> {
    const cached = await lookupToken(token);
    if (!cached) {
      return { status: "error", errorMessage: "Token not found in cache", timestamp: new Date(), isOffline: true };
    }
    if (!cached.isActive || cached.registrationStatus !== "PAID") {
      return {
        status: "error",
        person: { name: cached.personName, koreanName: cached.koreanName },
        errorMessage: !cached.isActive ? "E-Pass is inactive" : "Registration is not paid",
        timestamp: new Date(),
        isOffline: true,
      };
    }
    const nonce = crypto.randomUUID();
    await addPendingCheckin({ token, checkinType: "MAIN", sessionId: null, timestamp: new Date().toISOString(), nonce });
    setPendingSyncCount((prev) => prev + 1);
    return {
      status: "checked_in",
      person: { name: cached.personName, koreanName: cached.koreanName },
      confirmationCode: cached.confirmationCode,
      checkinType: "MAIN",
      timestamp: new Date(),
      isOffline: true,
    };
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Kiosk Header */}
      <div className="flex items-center justify-between p-3 border-b bg-card">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">Kiosk Check-in</h1>
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="w-[220px]">
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

        <div className="flex items-center gap-2">
          <Badge variant={isOnline ? "default" : "destructive"} className="gap-1">
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? "Online" : "Offline"}
          </Badge>
          <Badge variant={cacheStatus === "ready" ? "secondary" : "outline"} className="gap-1">
            <Database className="h-3 w-3" />
            {cacheStatus === "ready" ? `Cache: ${cacheCount}` : cacheStatus === "loading" ? "Loading..." : "No cache"}
          </Badge>
          {pendingSyncCount > 0 && (
            <Badge variant="outline" className="gap-1">
              <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
              {pendingSyncCount} pending
            </Badge>
          )}
          <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Scanner Area */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-xl space-y-4">
          <div className="aspect-square relative rounded-lg overflow-hidden border">
            {scanning ? (
              <Scanner
                onScan={handleScan}
                allowMultiple={false}
                scanDelay={500}
                components={{ finder: true }}
                styles={{
                  container: { width: "100%", height: "100%" },
                  video: { objectFit: "cover" as const },
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted/30">
                {processing ? (
                  <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
                ) : (
                  <p className="text-muted-foreground">Resuming scanner...</p>
                )}
              </div>
            )}
          </div>

          <ScanResultCard result={scanResult} />
        </div>
      </div>
    </div>
  );
}
