"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import {
  ScanResultCard,
  type ScanResult,
} from "@/components/checkin/scan-result-card";
import { RecentCheckins } from "@/components/checkin/recent-checkins";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ScanLine,
  Users,
  Pause,
  Play,
  Loader2,
  LogOut,
} from "lucide-react";
import { CameraErrorFallback } from "@/components/checkin/camera-error-fallback";
import { useCameraPermission } from "@/lib/checkin/use-camera-permission";
import { addCheckinLog, getRecentLogs } from "@/lib/checkin/offline-store";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

function parseQRValue(
  scannedValue: string
): { participantCode: string } | { token: string } | null {
  const trimmed = scannedValue.trim();
  if (/^[A-HJ-NP-Z2-9]{6}\.[a-f0-9]{8}$/.test(trimmed)) {
    return { participantCode: trimmed };
  }
  if (/^[A-HJ-NP-Z2-9]{6}$/.test(trimmed)) {
    return { participantCode: trimmed };
  }
  const urlMatch = trimmed.match(/\/epass\/(?:[A-Za-z0-9]+_)?([A-Za-z0-9_-]{20,})/);
  if (urlMatch) return { token: urlMatch[1] };
  if (/^[A-Za-z0-9_-]{20,40}$/.test(trimmed)) return { token: trimmed };
  return null;
}

function playBeep(success: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = success ? 600 : 300;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + (success ? 0.2 : 0.3));
  } catch {
    // Audio not available
  }
}

function vibrate(success: boolean) {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(success ? [50, 50, 50] : [100, 50, 100]);
    }
  } catch {
    // Vibration not available
  }
}

export function CheckoutClient({ events }: { events: EventOption[] }) {
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [checkoutCount, setCheckoutCount] = useState(0);
  const [recentCheckins, setRecentCheckins] = useState<ScanResult[]>([]);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const camera = useCameraPermission();

  useEffect(() => {
    getRecentLogs(30).then((logs) => {
      const checkoutLogs = logs.filter((l) => l.checkinType === "CHECKOUT");
      setRecentCheckins(
        checkoutLogs.map((l) => ({
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
  }, []);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
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

  const handleScan = useCallback(
    async (detectedCodes: { rawValue: string }[]) => {
      if (processing || !detectedCodes.length) return;
      const rawValue = detectedCodes[0].rawValue;
      const parsed = parseQRValue(rawValue);
      if (!parsed) return;

      const dedupeKey =
        "participantCode" in parsed ? parsed.participantCode : parsed.token;
      if (lastScannedRef.current === dedupeKey) return;
      lastScannedRef.current = dedupeKey;

      setProcessing(true);
      setScanning(false);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);

      let result: ScanResult;

      try {
        const checkoutBody: Record<string, string> = {};
        if ("participantCode" in parsed) {
          checkoutBody.participantCode = parsed.participantCode;
        } else {
          checkoutBody.token = parsed.token;
        }

        const res = await fetch("/api/checkin/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(checkoutBody),
        });

        const data = await res.json();

        if (res.ok) {
          result = {
            status: data.status, // "checked_out" or "already_checked_out"
            person: data.person,
            confirmationCode: data.confirmationCode,
            checkinType: "CHECKOUT",
            checkedInAt: data.checkedInAt,
            checkedOutAt: data.checkedOutAt,
            timestamp: new Date(),
            isOffline: false,
          };
          if (data.status === "checked_out") {
            setCheckoutCount((prev) => prev + 1);
          }
        } else if (res.status === 404) {
          result = {
            status: "error",
            person: data.person,
            errorMessage: data.error || "Not checked in yet",
            timestamp: new Date(),
            isOffline: false,
          };
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

      const isSuccess = result.status !== "error";
      playBeep(isSuccess);
      vibrate(isSuccess);

      setScanResult(result);
      setRecentCheckins((prev) => [result, ...prev].slice(0, 30));

      await addCheckinLog({
        personName: result.person?.name ?? "Unknown",
        koreanName: result.person?.koreanName ?? null,
        confirmationCode: result.confirmationCode ?? null,
        status: result.status === "checked_out" || result.status === "already_checked_out" ? "checked_in" : result.status,
        checkinType: "CHECKOUT",
        timestamp: result.timestamp.toISOString(),
        isOffline: result.isOffline ?? false,
        errorMessage: result.errorMessage,
      });

      setProcessing(false);
      startResumeCountdown();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [processing]
  );

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

        <Badge variant="outline" className="gap-1.5 px-3 py-2 text-sm self-start">
          <LogOut className="h-4 w-4" />
          Check-out Mode
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <LogOut className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Checked Out</p>
              <p className="font-medium text-lg">{checkoutCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">This Session</p>
              <p className="font-medium text-lg">{recentCheckins.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scanner + Recent */}
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
              <div className="aspect-square max-w-[400px] mx-auto relative rounded-lg overflow-hidden border">
                {camera.status !== "granted" ? (
                  <div className="w-full h-full flex items-center justify-center bg-muted/30">
                    <CameraErrorFallback
                      status={camera.status}
                      onAllow={camera.allow}
                    />
                  </div>
                ) : scanning ? (
                  <Scanner
                    constraints={{ facingMode: { ideal: "environment" } }}
                    onScan={handleScan}
                    onError={(err) => {
                      const msg = err instanceof Error ? err.name : "";
                      if (msg === "NotAllowedError") {
                        camera.deny();
                      } else {
                        setScanning(false);
                      }
                    }}
                    allowMultiple={false}
                    scanDelay={500}
                    components={{ finder: true }}
                    styles={{
                      container: { width: "100%", height: "100%" },
                      video: { objectFit: "cover" as const },
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-muted/30 gap-3">
                    {processing ? (
                      <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                    ) : resumeCountdown !== null ? (
                      <>
                        <Pause className="h-10 w-10 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Resuming in {resumeCountdown}s
                        </p>
                      </>
                    ) : (
                      <Button
                        size="lg"
                        className="gap-2"
                        onClick={() => {
                          setScanning(true);
                          setScanResult(null);
                          lastScannedRef.current = null;
                        }}
                      >
                        <Play className="h-4 w-4" />
                        Start Scanning
                      </Button>
                    )}
                  </div>
                )}
                {scanning && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute bottom-3 right-3 gap-1"
                    onClick={() => {
                      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
                      if (countdownRef.current) clearInterval(countdownRef.current);
                      setResumeCountdown(null);
                      setScanning(false);
                    }}
                  >
                    <Pause className="h-4 w-4" /> Pause
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <ScanResultCard result={scanResult} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Check-outs</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentCheckins checkins={recentCheckins} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
