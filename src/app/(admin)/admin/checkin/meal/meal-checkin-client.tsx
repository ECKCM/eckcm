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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ScanLine,
  Users,
  Pause,
  Play,
  Loader2,
  UtensilsCrossed,
  Coffee,
  Sun,
  Moon,
} from "lucide-react";
import { CameraErrorFallback } from "@/components/checkin/camera-error-fallback";
import { useCameraPermission } from "@/lib/checkin/use-camera-permission";
import { addCheckinLog, getRecentLogs } from "@/lib/checkin/offline-store";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
  start_date: string;
  end_date: string;
}

type MealType = "BREAKFAST" | "LUNCH" | "DINNER";

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

function getCurrentMealType(): MealType {
  const hour = new Date().getHours();
  if (hour < 10) return "BREAKFAST";
  if (hour < 14) return "LUNCH";
  return "DINNER";
}

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function getEventDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

const MEAL_ICONS: Record<MealType, React.ReactNode> = {
  BREAKFAST: <Coffee className="h-4 w-4" />,
  LUNCH: <Sun className="h-4 w-4" />,
  DINNER: <Moon className="h-4 w-4" />,
};

const MEAL_LABELS: Record<MealType, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
};

export function MealCheckinClient({ events }: { events: EventOption[] }) {
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const [mealType, setMealType] = useState<MealType>(getCurrentMealType());
  const [mealDate, setMealDate] = useState(getTodayDate());
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [mealCount, setMealCount] = useState(0);
  const [recentCheckins, setRecentCheckins] = useState<ScanResult[]>([]);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const camera = useCameraPermission();

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const eventDates = selectedEvent
    ? getEventDates(selectedEvent.start_date, selectedEvent.end_date)
    : [];

  // Load recent logs and meal count
  useEffect(() => {
    getRecentLogs(30).then((logs) => {
      setRecentCheckins(
        logs
          .filter((l) => l.checkinType === "DINING")
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
  }, []);

  // Load meal count for current date+type
  useEffect(() => {
    if (!selectedEventId || !mealDate || !mealType) return;
    fetch(`/api/checkin/stats?eventId=${selectedEventId}`)
      .then((r) => r.json())
      .then((data) => {
        setMealCount(data.checkins?.dining ?? 0);
      })
      .catch(() => {});
  }, [selectedEventId, mealDate, mealType]);

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
        const verifyBody: Record<string, string> = {
          checkinType: "DINING",
          mealDate,
          mealType,
        };
        if ("participantCode" in parsed) {
          verifyBody.participantCode = parsed.participantCode;
        } else {
          verifyBody.token = parsed.token;
        }

        const res = await fetch("/api/checkin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(verifyBody),
        });

        const data = await res.json();

        if (res.ok) {
          result = {
            status: data.status,
            person: data.person,
            confirmationCode: data.confirmationCode,
            checkinType: "DINING",
            mealType: MEAL_LABELS[mealType],
            mealDate,
            timestamp: new Date(),
            isOffline: false,
          };
          if (data.status === "checked_in") {
            setMealCount((prev) => prev + 1);
          }
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
            errorMessage: data.error || "Meal check-in failed",
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
        checkinType: "DINING",
        timestamp: result.timestamp.toISOString(),
        isOffline: result.isOffline ?? false,
        errorMessage: result.errorMessage,
      });

      setProcessing(false);
      startResumeCountdown();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [processing, mealDate, mealType]
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
          <SelectTrigger className="w-full sm:w-[220px]">
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

        <Select value={mealDate} onValueChange={setMealDate}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Select date" />
          </SelectTrigger>
          <SelectContent>
            {eventDates.map((d) => (
              <SelectItem key={d} value={d}>
                {new Date(d + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
                {d === getTodayDate() ? " (Today)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs
          value={mealType}
          onValueChange={(v) => setMealType(v as MealType)}
        >
          <TabsList>
            <TabsTrigger value="BREAKFAST" className="gap-1.5">
              <Coffee className="h-4 w-4" />
              Breakfast
            </TabsTrigger>
            <TabsTrigger value="LUNCH" className="gap-1.5">
              <Sun className="h-4 w-4" />
              Lunch
            </TabsTrigger>
            <TabsTrigger value="DINNER" className="gap-1.5">
              <Moon className="h-4 w-4" />
              Dinner
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Current Meal</p>
              <p className="font-medium flex items-center gap-1.5">
                {MEAL_ICONS[mealType]} {MEAL_LABELS[mealType]}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Served Today</p>
              <p className="font-medium text-lg">{mealCount}</p>
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
                  Meal Scanner
                </CardTitle>
                <Badge variant="secondary">
                  {MEAL_LABELS[mealType]} &middot;{" "}
                  {new Date(mealDate + "T12:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
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
            <CardTitle className="text-base">Recent Meal Check-ins</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentCheckins checkins={recentCheckins} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
