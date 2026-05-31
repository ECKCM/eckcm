"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
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
  Wifi,
  WifiOff,
  Maximize2,
  Minimize2,
  Camera,
  Keyboard,
  Beaker,
  Sparkles,
  Coffee,
  Sun,
  Moon,
  CheckCircle2,
  AlertOctagon,
  Loader2,
  Play,
  Pause,
  Square,
  Users,
  Database,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { feedback } from "@/lib/checkin/scanner-feedback";
import { parseQRValue, toVerifyBody } from "@/lib/checkin/qr-parser";
import { useCameraPermission } from "@/lib/checkin/use-camera-permission";
import {
  useCameraDevices,
  type CameraFacing,
} from "@/lib/checkin/use-camera-devices";
import { useHidScanner } from "@/lib/checkin/use-hid-scanner";
import { useScanSession } from "@/lib/checkin/use-scan-session";
import { useEpassCache } from "@/lib/checkin/use-epass-cache";
import {
  realtimeCheckinToScanResult,
  useRealtimeCheckins,
} from "@/lib/checkin/use-realtime-checkins";
import {
  DEFAULT_MEAL_SCHEDULE,
  MEAL_KEYS,
  MEAL_KEY_TO_TYPE,
  type MealKey,
  type MealSchedule,
  suggestMealKey,
} from "@/lib/meal-schedule";
import { CameraSelect } from "@/components/checkin/camera-select";
import { InvalidQrOverlay } from "@/components/checkin/invalid-qr-overlay";
import { RecentCheckins } from "@/components/checkin/recent-checkins";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
  start_date: string | null;
  end_date: string | null;
}

type InputMode = "camera" | "hardware" | "fake";

const MEAL_ICON: Record<MealKey, React.ReactNode> = {
  breakfast: <Coffee className="h-5 w-5" />,
  lunch: <Sun className="h-5 w-5" />,
  dinner: <Moon className="h-5 w-5" />,
};

const MEAL_LABEL: Record<MealKey, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

const MEAL_KIND: Record<MealKey, "MEAL_BREAKFAST" | "MEAL_LUNCH" | "MEAL_DINNER"> = {
  breakfast: "MEAL_BREAKFAST",
  lunch: "MEAL_LUNCH",
  dinner: "MEAL_DINNER",
};

interface DisplayedResult {
  ok: boolean;
  title: string;
  subtitle?: string;
  detail?: string;
  participantCode?: string | null;
  mealCategory?: "adult" | "youth" | "free" | null;
  totalCount?: number;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export function KioskCheckinClient({ events }: { events: EventOption[] }) {
  // Persisted setup (per kiosk device).
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const [mealDate, setMealDate] = useState(todayISO());
  const [schedule, setSchedule] = useState<MealSchedule>(DEFAULT_MEAL_SCHEDULE);
  const [mealKey, setMealKey] = useState<MealKey>("lunch");
  const [inputMode, setInputMode] = useState<InputMode>("camera");
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>("user");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Per-scan ephemeral state.
  const [processing, setProcessing] = useState(false);
  const [invalidFlashId, setInvalidFlashId] = useState<number | null>(null);
  const [display, setDisplay] = useState<DisplayedResult | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const camera = useCameraPermission();
  const devices = useCameraDevices({
    defaultFacing: cameraFacing,
    storageKey: "checkin.kiosk.cameraDeviceId",
    enabled: camera.status === "granted",
  });
  const scanSession = useScanSession({ storageKey: "checkin.scanSessionId.kiosk" });
  const cache = useEpassCache({ eventId: selectedEventId || null });

  // Restore persisted preferences.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.localStorage.getItem("checkin.kiosk.inputMode") as InputMode | null;
    if (m) setInputMode(m);
    const cf = window.localStorage.getItem("checkin.kiosk.cameraFacing") as CameraFacing | null;
    if (cf) setCameraFacing(cf);
  }, []);

  const updateInputMode = (m: InputMode) => {
    setInputMode(m);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("checkin.kiosk.inputMode", m);
    }
  };

  const updateCameraFacing = (cf: CameraFacing) => {
    setCameraFacing(cf);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("checkin.kiosk.cameraFacing", cf);
    }
  };

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const onOn = () => setIsOnline(true);
    const onOff = () => setIsOnline(false);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    return () => {
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
    };
  }, []);

  useEffect(() => () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  }, []);

  // Load meal schedule once and suggest a meal.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/app-config");
        if (res.ok) {
          const data = await res.json();
          if (data.meal_schedule) {
            const sched: MealSchedule = {
              breakfast: data.meal_schedule.breakfast ?? DEFAULT_MEAL_SCHEDULE.breakfast,
              lunch: data.meal_schedule.lunch ?? DEFAULT_MEAL_SCHEDULE.lunch,
              dinner: data.meal_schedule.dinner ?? DEFAULT_MEAL_SCHEDULE.dinner,
            };
            setSchedule(sched);
            setMealKey(suggestMealKey(sched));
          }
        }
      } catch {
        // defaults
      }
    })();
  }, []);

  // Detach stale stored sessions when meal/date/event changes.
  useEffect(() => {
    if (!scanSession.session) return;
    const mealMismatch =
      scanSession.session.event_id !== selectedEventId ||
      scanSession.session.meal_date !== mealDate ||
      scanSession.session.kind !== MEAL_KIND[mealKey];
    if (mealMismatch) {
      scanSession.detach();
    }
  }, [selectedEventId, mealDate, mealKey, scanSession]);

  const realtime = useRealtimeCheckins({
    eventId: selectedEventId || null,
    scanSessionId: scanSession.session?.id ?? null,
    checkinType: "DINING",
    limit: 20,
    enabled: Boolean(scanSession.session),
  });

  const recentResults = useMemo(
    () => realtime.checkins.map(realtimeCheckinToScanResult),
    [realtime.checkins]
  );

  const flashInvalid = useCallback(() => setInvalidFlashId(Date.now()), []);

  const processRawValue = useCallback(
    async (rawValue: string) => {
      if (!scanSession.canScan || !scanSession.session) return;
      const parsed = parseQRValue(rawValue);
      if (!parsed) {
        flashInvalid();
        feedback("error");
        return;
      }
      const dedupeKey =
        parsed.kind === "participantCode" ? parsed.participantCode : parsed.token;
      if (lastScannedRef.current === dedupeKey) return;
      lastScannedRef.current = dedupeKey;

      if (processing) return;
      setProcessing(true);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);

      // Cache-first: render the participant immediately while the verify
      // call lands. The kiosk's display overlay gets the name right away.
      const cached = await cache.lookup(parsed);
      if (cached) {
        setDisplay({
          ok: true,
          title: "Confirming…",
          subtitle: cached.personName,
          detail: cached.koreanName ?? undefined,
          participantCode: cached.participantCode ?? null,
        });
      }

      try {
        const res = await fetch("/api/checkin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...toVerifyBody(parsed),
            checkinType: "DINING",
            mealDate,
            mealType: MEAL_KEY_TO_TYPE[mealKey],
            scanSessionId: scanSession.session.id,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          const ok = data.status === "checked_in";
          feedback(ok ? "success" : "warn");
          setDisplay({
            ok: data.status !== "error",
            title:
              data.status === "checked_in"
                ? "Welcome!"
                : data.status === "already_checked_in"
                  ? "Already checked in"
                  : "Done",
            subtitle: data.person?.name,
            detail: data.person?.koreanName ?? undefined,
            participantCode: data.person?.participantCode ?? null,
            mealCategory: data.person?.mealCategory ?? null,
            totalCount: data.totalCount,
          });
        } else {
          feedback("error");
          setDisplay({
            ok: false,
            title: "Cannot serve",
            subtitle: data.person?.name,
            detail: data.error ?? "Try again",
          });
        }
      } catch {
        feedback("error");
        setDisplay({ ok: false, title: "Network error", detail: "Try again" });
      } finally {
        setProcessing(false);
        // Reset for next scan after 3s
        resumeTimerRef.current = setTimeout(() => {
          setDisplay(null);
          lastScannedRef.current = null;
        }, 3000);
      }
    },
    [scanSession.canScan, scanSession.session, processing, mealDate, mealKey, cache, flashInvalid]
  );

  // Hardware scanner — always listens when in `hardware` mode, regardless of
  // focus, because USB scanners blast Enter at the active window.
  useHidScanner({
    enabled: inputMode === "hardware" && scanSession.canScan,
    onScan: processRawValue,
  });

  // Camera scanner handler — feeds into the same pipeline.
  const handleCameraScan = useCallback(
    (codes: { rawValue: string }[]) => {
      if (!codes.length) return;
      if (inputMode === "fake") {
        // Fake mode: ignore actual decoded codes; the camera is just for show.
        return;
      }
      processRawValue(codes[0].rawValue);
    },
    [inputMode, processRawValue]
  );

  function toggleFullscreen() {
    if (typeof document === "undefined") return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }

  const constraints = devices.selectedDeviceId
    ? { deviceId: { exact: devices.selectedDeviceId } }
    : { facingMode: { ideal: cameraFacing } };

  const liveCount = realtime.checkins.length;

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="border-b bg-card/70 backdrop-blur px-4 py-2 flex items-center gap-2 flex-wrap">
        <Button asChild variant="ghost" size="icon" className="h-9 w-9">
          <Link href="/admin/checkin" aria-label="Back to check-in">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>

        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="Event" />
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
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={todayISO()}>Today</SelectItem>
          </SelectContent>
        </Select>

        <Tabs value={mealKey} onValueChange={(v) => setMealKey(v as MealKey)}>
          <TabsList>
            {MEAL_KEYS.map((k) => (
              <TabsTrigger key={k} value={k} className="gap-1.5">
                {MEAL_ICON[k]}
                <span className="hidden sm:inline">{MEAL_LABEL[k]}</span>
                {suggestMealKey(schedule) === k && (
                  <Sparkles className="h-3 w-3 text-amber-500" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-2">
          <Tabs value={inputMode} onValueChange={(v) => updateInputMode(v as InputMode)}>
            <TabsList>
              <TabsTrigger value="camera" className="gap-1.5">
                <Camera className="h-4 w-4" />
                <span className="hidden md:inline">Camera</span>
              </TabsTrigger>
              <TabsTrigger value="hardware" className="gap-1.5">
                <Keyboard className="h-4 w-4" />
                <span className="hidden md:inline">Hardware</span>
              </TabsTrigger>
              <TabsTrigger value="fake" className="gap-1.5">
                <Beaker className="h-4 w-4" />
                <span className="hidden md:inline">Demo</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {inputMode === "camera" && (
            <Tabs
              value={cameraFacing}
              onValueChange={(v) => updateCameraFacing(v as CameraFacing)}
            >
              <TabsList>
                <TabsTrigger value="user">Front</TabsTrigger>
                <TabsTrigger value="environment">Back</TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <Badge variant={isOnline ? "default" : "destructive"} className="gap-1">
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? "Online" : "Offline"}
          </Badge>

          <Badge
            variant={
              cache.status === "ready"
                ? "secondary"
                : cache.status === "error"
                  ? "destructive"
                  : "outline"
            }
            className="gap-1"
          >
            <Database className="h-3 w-3" />
            {cache.status === "loading"
              ? "Syncing"
              : cache.status === "ready"
                ? `${cache.count}`
                : "No cache"}
          </Badge>

          <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* Scan session strip */}
      <div className="border-b bg-card/40 px-4 py-2 flex items-center gap-3 flex-wrap">
        {scanSession.session ? (
          <>
            <Badge
              className={
                scanSession.canScan
                  ? "gap-1 bg-green-600 hover:bg-green-700"
                  : "gap-1"
              }
              variant={scanSession.canScan ? "default" : "secondary"}
            >
              {scanSession.canScan ? (
                <>
                  <Play className="h-3 w-3" />
                  Live
                </>
              ) : (
                <>
                  <Pause className="h-3 w-3" />
                  Paused
                </>
              )}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {scanSession.session.label}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Users className="h-3 w-3" />
                {liveCount}
              </Badge>
              {scanSession.canScan ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={scanSession.pause}
                  className="gap-1.5"
                >
                  <Pause className="h-4 w-4" /> Pause
                </Button>
              ) : (
                <Button size="sm" onClick={scanSession.resume} className="gap-1.5">
                  <Play className="h-4 w-4" /> Resume
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" className="gap-1.5">
                    <Square className="h-4 w-4" /> Stop
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>End this kiosk session?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Scanning will stop immediately and the session will be
                      closed. You can review the check-ins it recorded under{" "}
                      <span className="font-mono">Scan Sessions</span> later.
                      Use <strong>Pause</strong> instead if you only need a
                      short break.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => scanSession.end()}>
                      End session
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        ) : (
          <>
            <span className="text-sm text-muted-foreground">No scan session</span>
            <Button
              size="sm"
              className="ml-auto"
              disabled={!selectedEventId}
              onClick={() =>
                scanSession.start({
                  eventId: selectedEventId,
                  kind: MEAL_KIND[mealKey],
                  mealDate,
                  label: `${MEAL_LABEL[mealKey]} · ${mealDate} · Kiosk`,
                })
              }
            >
              <Play className="h-4 w-4 mr-1" />
              Start {MEAL_LABEL[mealKey]} Kiosk
            </Button>
          </>
        )}
      </div>

      {/* Main scan area */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] overflow-hidden">
        <div className="relative flex items-center justify-center p-6 overflow-hidden">
          {/* Camera / hardware viewport */}
          <div className="relative w-full max-w-2xl aspect-square rounded-3xl overflow-hidden border-4 border-slate-200 dark:border-slate-800 shadow-2xl">
            {inputMode === "camera" && camera.status === "granted" && scanSession.canScan ? (
              <Scanner
                key={`${devices.selectedDeviceId ?? cameraFacing}`}
                constraints={constraints}
                onScan={handleCameraScan}
                onError={(err) => {
                  const msg = err instanceof Error ? err.name : "";
                  if (msg === "NotAllowedError") camera.deny();
                }}
                allowMultiple={false}
                scanDelay={400}
                components={{ finder: true }}
                styles={{
                  container: { width: "100%", height: "100%" },
                  video: { objectFit: "cover" as const },
                }}
              />
            ) : inputMode === "fake" ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-950/50 dark:to-pink-950/50">
                <Beaker className="h-24 w-24 text-purple-500 mb-4" />
                <p className="text-2xl font-semibold">Demo mode</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Camera preview only — no real check-ins
                </p>
              </div>
            ) : inputMode === "hardware" ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900">
                <Keyboard className="h-24 w-24 text-slate-400 mb-4" />
                <p className="text-2xl font-semibold">Hardware scanner</p>
                <p className="text-sm text-muted-foreground mt-2 text-center px-4">
                  Aim your USB / Bluetooth scanner at a QR code
                </p>
                {!scanSession.canScan && (
                  <p className="text-sm text-muted-foreground mt-4">
                    Scanning paused
                  </p>
                )}
              </div>
            ) : !scanSession.canScan ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900">
                <Pause className="h-16 w-16 text-slate-400 mb-3" />
                <p className="text-lg text-muted-foreground">
                  Start a session to begin
                </p>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-900">
                <p className="text-muted-foreground">
                  Allow camera to start scanning
                </p>
              </div>
            )}

            {processing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                <Loader2 className="h-16 w-16 animate-spin" />
              </div>
            )}

            {/* Result overlay */}
            {display && (
              <div
                className={`absolute inset-0 flex flex-col items-center justify-center text-white animate-in fade-in zoom-in duration-200 ${
                  display.ok ? "bg-green-600/95" : "bg-amber-600/95"
                }`}
              >
                {display.ok ? (
                  <CheckCircle2 className="h-32 w-32 mb-4 drop-shadow-lg" />
                ) : (
                  <AlertOctagon className="h-32 w-32 mb-4 drop-shadow-lg" />
                )}
                <p className="text-5xl font-extrabold tracking-tight">{display.title}</p>
                {display.subtitle && (
                  <p className="text-3xl font-semibold mt-3">{display.subtitle}</p>
                )}
                {display.detail && (
                  <p className="text-xl opacity-90 mt-1">{display.detail}</p>
                )}
                <div className="flex items-center gap-2 mt-5">
                  {display.participantCode && (
                    <Badge variant="outline" className="text-white border-white/40 font-mono text-base">
                      {display.participantCode}
                    </Badge>
                  )}
                  {display.mealCategory && (
                    <Badge variant="outline" className="text-white border-white/40 capitalize text-base">
                      {display.mealCategory === "adult"
                        ? "General"
                        : display.mealCategory === "youth"
                          ? "Youth"
                          : "Free"}
                    </Badge>
                  )}
                </div>
                {typeof display.totalCount === "number" && (
                  <p className="text-lg opacity-90 mt-5">
                    Total served: <span className="font-bold">{display.totalCount}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Camera select (only camera mode) */}
          {inputMode === "camera" && camera.status === "granted" && (
            <div className="absolute bottom-4 left-4 right-4 flex justify-center">
              <CameraSelect
                devices={devices.devices}
                value={devices.selectedDeviceId}
                onChange={devices.setSelectedDeviceId}
              />
            </div>
          )}
        </div>

        {/* Recent sidebar */}
        <aside className="hidden lg:flex flex-col border-l bg-card/40">
          <div className="px-4 py-3 border-b">
            <p className="text-sm font-semibold">Recent Check-ins</p>
            <p className="text-xs text-muted-foreground">
              Live across all kiosks &amp; phones
            </p>
          </div>
          <div className="flex-1 overflow-auto p-2">
            <RecentCheckins checkins={recentResults} />
          </div>
        </aside>
      </main>

      <InvalidQrOverlay trigger={invalidFlashId} />
    </div>
  );
}
