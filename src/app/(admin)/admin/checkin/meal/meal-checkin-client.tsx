"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Coffee, Sun, Moon, ScanLine, Users, Sparkles } from "lucide-react";
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
import {
  DEFAULT_MEAL_SCHEDULE,
  MEAL_KEYS,
  MEAL_KEY_TO_TYPE,
  type MealKey,
  type MealSchedule,
  suggestMealKey,
  formatMealWindow,
} from "@/lib/meal-schedule";
import type { ScanSessionKind } from "@/lib/types/checkin";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
  start_date: string | null;
  end_date: string | null;
}

const MEAL_KIND_BY_KEY: Record<MealKey, ScanSessionKind> = {
  breakfast: "MEAL_BREAKFAST",
  lunch: "MEAL_LUNCH",
  dinner: "MEAL_DINNER",
};

const MEAL_ICON: Record<MealKey, React.ReactNode> = {
  breakfast: <Coffee className="h-4 w-4" />,
  lunch: <Sun className="h-4 w-4" />,
  dinner: <Moon className="h-4 w-4" />,
};

const MEAL_LABEL: Record<MealKey, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function getEventDates(startDate: string | null, endDate: string | null): string[] {
  if (!startDate || !endDate) return [getTodayDate()];
  const dates: string[] = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates.length > 0 ? dates : [getTodayDate()];
}

export function MealCheckinClient({ events }: { events: EventOption[] }) {
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const [mealDate, setMealDate] = useState(getTodayDate());
  const [schedule, setSchedule] = useState<MealSchedule>(DEFAULT_MEAL_SCHEDULE);
  const [mealKey, setMealKey] = useState<MealKey>("lunch");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const [scannerLive, setScannerLive] = useState(true);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const eventDates = useMemo(
    () => getEventDates(selectedEvent?.start_date ?? null, selectedEvent?.end_date ?? null),
    [selectedEvent?.start_date, selectedEvent?.end_date]
  );

  // Load meal schedule once.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/app-config");
        if (res.ok) {
          const data = await res.json();
          if (data.meal_schedule) {
            setSchedule({
              breakfast: data.meal_schedule.breakfast ?? DEFAULT_MEAL_SCHEDULE.breakfast,
              lunch: data.meal_schedule.lunch ?? DEFAULT_MEAL_SCHEDULE.lunch,
              dinner: data.meal_schedule.dinner ?? DEFAULT_MEAL_SCHEDULE.dinner,
            });
          }
        }
      } catch {
        // Fall back to defaults
      }
    })();
  }, []);

  // Auto-suggest the meal key based on the time. Only on mount + when schedule changes.
  useEffect(() => {
    setMealKey(suggestMealKey(schedule));
  }, [schedule]);

  useEffect(() => () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const scanSession = useScanSession({ storageKey: "checkin.scanSessionId.meal" });
  const cache = useEpassCache({ eventId: selectedEventId || null });

  // Detach the stored session if it's stale relative to the current selection
  // (e.g. different meal or date) — operator will just start a new one.
  useEffect(() => {
    if (!scanSession.session) return;
    const sessionMealKey = (Object.entries(MEAL_KIND_BY_KEY).find(
      ([, kind]) => kind === scanSession.session?.kind
    )?.[0] ?? null) as MealKey | null;
    const matches =
      scanSession.session.event_id === selectedEventId &&
      sessionMealKey === mealKey &&
      scanSession.session.meal_date === mealDate;
    if (!matches) {
      scanSession.detach();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, mealKey, mealDate, scanSession.session?.id]);

  const realtime = useRealtimeCheckins({
    eventId: selectedEventId || null,
    scanSessionId: scanSession.session?.id ?? null,
    checkinType: "DINING",
    limit: 50,
    enabled: Boolean(scanSession.session),
  });

  const recentResults = useMemo(
    () => realtime.checkins.map(realtimeCheckinToScanResult),
    [realtime.checkins]
  );

  const handleStart = useCallback(async () => {
    if (!selectedEventId) return;
    await scanSession.start({
      eventId: selectedEventId,
      kind: MEAL_KIND_BY_KEY[mealKey],
      mealDate,
      label: `${MEAL_LABEL[mealKey]} · ${mealDate}`,
    });
    setScannerLive(true);
  }, [scanSession, selectedEventId, mealKey, mealDate]);

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

      // Cache-first preview — renders the name & meal category instantly while
      // verify completes. Status stays pending until the server lands.
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
          checkinType: "DINING",
          mealType: MEAL_LABEL[mealKey],
          mealDate,
          timestamp: new Date(),
          isPending: true,
        });
        feedback("success");
      }

      let result: ScanResult;
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
          result = {
            status: data.status,
            person: data.person,
            registration: data.registration,
            confirmationCode: data.confirmationCode,
            checkinType: data.checkinType,
            mealType: MEAL_LABEL[mealKey],
            mealDate,
            isSandbox: data.isSandbox,
            timestamp: new Date(),
            isOffline: false,
          };
        } else {
          result = {
            status: "error",
            person: data.person,
            registration: data.registration,
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

      // Suppress the success beep if the optimistic preview already played one
      // and the server confirms a clean check-in. Errors and "already" still
      // beep to override the optimistic sound.
      if (!cached || result.status !== "checked_in") {
        const tone =
          result.status === "checked_in"
            ? "success"
            : result.status === "error"
              ? "error"
              : "warn";
        feedback(tone);
      }
      setScanResult(result);
      setProcessing(false);
      startResumeCountdown();
    },
    [scanSession.canScan, scanSession.session, mealDate, mealKey, cache, startResumeCountdown]
  );

  const sessionActive = scanSession.canScan;
  const disabledReason = !scanSession.session
    ? "Start a scan session to enable scanning"
    : scanSession.status === "PAUSED"
      ? "Session paused"
      : scanSession.status === "ENDED"
        ? "Session ended"
        : undefined;

  return (
    <div className="space-y-4">
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
          <SelectTrigger className="w-full sm:w-[200px]">
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

        <Tabs value={mealKey} onValueChange={(v) => setMealKey(v as MealKey)}>
          <TabsList>
            {MEAL_KEYS.map((k) => {
              const suggested = suggestMealKey(schedule);
              return (
                <TabsTrigger key={k} value={k} className="gap-1.5">
                  {MEAL_ICON[k]} {MEAL_LABEL[k]}
                  {suggested === k && (
                    <Sparkles className="h-3 w-3 text-amber-500" />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      <CacheStatusBar
        status={cache.status}
        count={cache.count}
        onResync={cache.refresh}
      />

      <Card>
        <CardContent className="py-3 px-4 text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span>
            <span className="font-medium text-foreground">{MEAL_LABEL[mealKey]}</span>{" "}
            window: {formatMealWindow(schedule[mealKey])}
          </span>
        </CardContent>
      </Card>

      <ScanSessionControls
        session={scanSession.session}
        loading={scanSession.loading}
        startLabel={`Start ${MEAL_LABEL[mealKey]} session`}
        startDisabled={!selectedEventId || !mealDate}
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
                  {MEAL_LABEL[mealKey]} Scanner
                </CardTitle>
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" />
                  {realtime.checkins.length} scanned
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
                cameraStorageNamespace="meal"
              />
            </CardContent>
          </Card>
          <ScanResultCard result={scanResult} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Meal Check-ins</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentCheckins checkins={recentResults} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
