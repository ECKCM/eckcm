"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  ArrowLeft,
  Radio,
  Beaker,
  Clock,
  Timer,
  UserRound,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { KIOSK_VERSION_LABEL } from "@/lib/version";
import { feedback, primeAudio } from "@/lib/checkin/scanner-feedback";
import { computeMealCategory } from "@/lib/checkin/meal-category";
import { parseQRValue, toVerifyBody, type ParsedQR } from "@/lib/checkin/qr-parser";
import { useCameraPermission } from "@/lib/checkin/use-camera-permission";
import {
  useCameraDevices,
  type CameraFacing,
} from "@/lib/checkin/use-camera-devices";
import { useHidScanner } from "@/lib/checkin/use-hid-scanner";
import { useScanSession } from "@/lib/checkin/use-scan-session";
import { useSessionKeepalive } from "@/lib/checkin/use-session-keepalive";
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
import { RecentCheckins } from "@/components/checkin/recent-checkins";
import { SurveillanceCamera } from "@/components/checkin/surveillance-camera";
import {
  ParticipantSearch,
  type SearchableParticipant,
} from "@/components/checkin/participant-search";
import { CacheStatusBar } from "@/components/checkin/cache-status-bar";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
  start_date: string | null;
  end_date: string | null;
}

type InputMode = "hardware" | "camera";
type ScanMode = "live" | "simulation";

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
  // Visual tone for the result card. Defaults from `ok` (success/warning); the
  // "duplicate" tone gives "Already checked in" its own colour so a repeat scan
  // is never mistaken for a fresh green "Welcome!".
  variant?: "success" | "warning" | "duplicate";
  title: string;
  subtitle?: string;
  detail?: string;
  participantCode?: string | null;
  mealCategory?: "adult" | "youth" | "free" | null;
  gender?: string | null;
}

interface Tally {
  total: number;
  general: number;
  youth: number;
  free: number;
  unknown: number;
}

interface MealStats {
  meal: Tally;
  session: Tally | null;
}

type MealCategoryKey = "general" | "youth" | "free" | "unknown";

function emptyTally(): Tally {
  return { total: 0, general: 0, youth: 0, free: 0, unknown: 0 };
}

function todayISO() {
  // Eastern Time basis — the gathering is on the US East Coast, so "today"
  // should follow the venue clock, not the operator's locale.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // en-CA yields YYYY-MM-DD
}

const RESUME_DELAY_MS = 1000;

// Hard ceiling on a single verify round-trip. If the server doesn't answer in
// time we abort so the scan loop releases its dedupe lock instead of freezing.
const VERIFY_TIMEOUT_MS = 12_000;

// Word the operator must type to confirm the event-wide "Reset All Meals" wipe.
const RESET_ALL_CONFIRM = "RESET";

/**
 * True when a meal date falls within a participant's stay window. Null/undefined
 * bounds mean "no restriction on that side". All values are YYYY-MM-DD, so a
 * lexical string compare is a correct date compare.
 */
function withinStayWindow(
  mealDate: string,
  start: string | null | undefined,
  end: string | null | undefined
): boolean {
  if (start && mealDate < start) return false;
  if (end && mealDate > end) return false;
  return true;
}

function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function KioskCheckinClient({ events }: { events: EventOption[] }) {
  const router = useRouter();
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const [mealDate, setMealDate] = useState(todayISO());
  const [schedule, setSchedule] = useState<MealSchedule>(DEFAULT_MEAL_SCHEDULE);
  const [mealKey, setMealKey] = useState<MealKey>("lunch");
  const [inputMode, setInputMode] = useState<InputMode>("hardware");
  const [scanMode, setScanMode] = useState<ScanMode>("live");
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>("environment");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [switchingMode, setSwitchingMode] = useState(false);
  // Allow off-window dates: when on (the default), any QR we issued is served
  // regardless of the participant's stay window — early arrivals, late
  // departures, off-window dates all count. Turn off to re-enforce the window.
  const [allowOutsideWindow, setAllowOutsideWindow] = useState(true);

  const [processing, setProcessing] = useState(false);
  const [display, setDisplay] = useState<DisplayedResult | null>(null);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Monotonic scan counter so a late verify response can't overwrite the
  // display when the operator has already moved on to the next person.
  const scanSeqRef = useRef(0);
  // Simulation mode bookkeeping. We don't send anything to the server while
  // simulating — instead, we dedupe + count entirely in-memory, scoped to
  // (mealKey, mealDate) so switching meal/date resets without losing the
  // sibling meal's tally. The dedupe Map remembers each scanned person's
  // meal category so the panel can break the count into General / Youth /
  // Free / Unknown instead of just total. `simBump` is a render trigger
  // because mutating a ref doesn't re-render on its own.
  const simDedupeRef = useRef<Map<string, Map<string, MealCategoryKey>>>(
    new Map()
  );
  const [simBump, setSimBump] = useState(0);
  // Two-step End: first press pauses + arms the End button (label flips to
  // "Confirm End"); a second press within 5 s opens the destructive confirm.
  // Stops a misplaced tap from killing the session in one go.
  const [endArmed, setEndArmed] = useState(false);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const endArmedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hard Reset (clears this meal's recorded live check-ins) confirm dialog.
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  // Reset All Meals (clears every meal's live check-ins for the event) —
  // gated behind a typed confirmation since it wipes the whole event.
  const [resetAllDialogOpen, setResetAllDialogOpen] = useState(false);
  const [resetAllConfirmText, setResetAllConfirmText] = useState("");

  // Roster for manual participant search (fallback when QR fails).
  const [roster, setRoster] = useState<SearchableParticipant[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const camera = useCameraPermission();
  const devices = useCameraDevices({
    defaultFacing: cameraFacing,
    storageKey: "checkin.kiosk.cameraDeviceId",
    enabled: camera.status === "granted" && inputMode === "camera",
  });
  const liveSession = useScanSession({
    storageKey: "checkin.scanSessionId.kiosk.live",
  });
  const simSession = useScanSession({
    storageKey: "checkin.scanSessionId.kiosk.simulation",
  });
  const scanSession = scanMode === "live" ? liveSession : simSession;
  const isSimulation = scanMode === "simulation";
  const cache = useEpassCache({ eventId: selectedEventId || null });

  // Keep the kiosk operator (e.g. upj@eckcm.com) signed in indefinitely. The
  // iPad is often left on for days; this proactively refreshes the Supabase
  // access token on a timer and on wake/online so it never expires into a
  // forced /login redirect mid-meal. See useSessionKeepalive for the why.
  useSessionKeepalive();

  // The meal date is a free, unrestricted native date input (see the header) —
  // no event-window enumeration or blackout filtering, so the kiosk can record
  // for any date (setup-day dry runs, backfilled meals, etc.).

  useEffect(() => {
    if (typeof window === "undefined") return;
    const im = window.localStorage.getItem("checkin.kiosk.inputMode") as InputMode | null;
    if (im === "camera" || im === "hardware") setInputMode(im);
    const sm = window.localStorage.getItem("checkin.kiosk.scanMode");
    if (sm === "live" || sm === "simulation") setScanMode(sm as ScanMode);
    else if (sm === "test") setScanMode("simulation"); // legacy
    const cf = window.localStorage.getItem("checkin.kiosk.cameraFacing") as CameraFacing | null;
    if (cf) setCameraFacing(cf);
    // Default is allow (true); only an explicit "false" disables it.
    const aow = window.localStorage.getItem("checkin.kiosk.allowOutsideWindow");
    if (aow === "false") setAllowOutsideWindow(false);
  }, []);

  const updateInputMode = useCallback((m: InputMode) => {
    setInputMode(m);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("checkin.kiosk.inputMode", m);
    }
  }, []);

  const updateCameraFacing = useCallback((cf: CameraFacing) => {
    setCameraFacing(cf);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("checkin.kiosk.cameraFacing", cf);
    }
  }, []);

  const updateScanMode = useCallback((m: ScanMode) => {
    setScanMode(m);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("checkin.kiosk.scanMode", m);
    }
  }, []);

  const updateAllowOutsideWindow = useCallback((v: boolean) => {
    setAllowOutsideWindow(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("checkin.kiosk.allowOutsideWindow", String(v));
    }
  }, []);

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

  // Keep the screen awake while a session is running — the HID scanner only
  // delivers keystrokes to the focused window, so the device sleeping == no
  // scans land. The Screen Wake Lock API auto-releases on tab hide and can
  // be re-requested when the tab comes back. Best-effort only (Safari iOS
  // has spotty support; we silently fall back to "operator dims screen").
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        sentinel = await (
          navigator as Navigator & {
            wakeLock: { request: (t: "screen") => Promise<WakeLockSentinel> };
          }
        ).wakeLock.request("screen");
      } catch {
        /* permissions / unsupported / not visible — ignore */
      }
    };
    acquire();
    const onVis = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      sentinel?.release().catch(() => {});
    };
  }, []);

  // Visibility warning. If the tab is backgrounded mid-session, HID keys
  // and the camera both stop landing on this surface — flag it loudly so
  // the operator brings us back to the foreground before continuing.
  const [tabHidden, setTabHidden] = useState(false);
  useEffect(() => {
    const onVis = () =>
      setTabHidden(document.visibilityState !== "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Auto-end on meal-window close was intentionally removed: the kiosk now
  // records regardless of date/time, so a live session stays open until the
  // operator ends it (or switches meal / date / event).

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Toggle html.kiosk-mode while this surface is mounted. The admin layout's
  // global stylesheet hides the sidebar + sticky header against that class so
  // the kiosk is a true full-screen surface (matches the print-mode pattern).
  // Removing the class on unmount restores normal admin chrome when the
  // operator navigates back to /admin/checkin.
  useEffect(() => {
    document.documentElement.classList.add("kiosk-mode");
    return () => document.documentElement.classList.remove("kiosk-mode");
  }, []);

  // Guard against accidental tab close / refresh / back navigation while a
  // scan session is active. A bumped iPad or a misplaced swipe shouldn't
  // silently end the session; force the operator through a confirm.
  //
  //  - beforeunload: native browser dialog on tab close / refresh / hard nav
  //  - popstate: history trap that re-pushes the kiosk URL on back-swipe
  //    and only releases the trap if the operator confirms
  //
  // Only armed while a session exists, so the operator can leave freely from
  // the idle setup screen.
  const sessionActive = Boolean(scanSession.session);
  useEffect(() => {
    if (!sessionActive) return;

    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore custom text but still show their own warning
      // when returnValue is set. Required for Chrome compatibility.
      e.returnValue = "";
    };

    window.history.pushState(null, "", window.location.href);
    const popState = () => {
      const confirmed = window.confirm(
        "Leave the kiosk? The active scan session will stay open, but you'll have to navigate back to keep scanning."
      );
      if (confirmed) {
        window.removeEventListener("popstate", popState);
        window.history.back();
      } else {
        window.history.pushState(null, "", window.location.href);
      }
    };

    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", popState);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", popState);
    };
  }, [sessionActive]);

  useEffect(
    () => () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (endArmedTimerRef.current) clearTimeout(endArmedTimerRef.current);
    },
    []
  );

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
        /* defaults */
      }
    })();
  }, []);

  // Drop stored sessions that no longer match the selected meal/date/event.
  useEffect(() => {
    const mismatch = (s: ReturnType<typeof useScanSession>["session"]) =>
      s !== null &&
      (s.event_id !== selectedEventId ||
        s.meal_date !== mealDate ||
        s.kind !== MEAL_KIND[mealKey]);
    if (mismatch(liveSession.session)) liveSession.detach();
    if (mismatch(simSession.session)) simSession.detach();
  }, [selectedEventId, mealDate, mealKey, liveSession, simSession]);

  // Reset transient per-scan UI whenever the active session changes (meal/date
  // switch, end, restore). Otherwise a countdown or an armed End timer from the
  // previous session lingers — the next "End" press skips its Arm step, or a
  // stale "Ready for next…" panel hangs over the new session until refresh.
  const activeSessionId = scanSession.session?.id ?? null;
  useEffect(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (endArmedTimerRef.current) clearTimeout(endArmedTimerRef.current);
    setResumeCountdown(null);
    setEndArmed(false);
    lastScannedRef.current = null;
  }, [activeSessionId]);

  // Searchable roster for the manual ParticipantSearch fallback.
  useEffect(() => {
    if (!selectedEventId) {
      setRoster([]);
      return;
    }
    let cancelled = false;
    setRosterLoading(true);
    fetch(`/api/checkin/participants?eventId=${selectedEventId}`)
      .then((r) => (r.ok ? r.json() : { participants: [] }))
      .then((d) => {
        if (!cancelled) setRoster(d.participants ?? []);
      })
      .catch(() => {
        if (!cancelled) setRoster([]);
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

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

  // Authoritative General / Youth / Free counts (meal-wide + per-session).
  const [stats, setStats] = useState<MealStats>({ meal: emptyTally(), session: null });
  const [statsLoading, setStatsLoading] = useState(false);
  const [bumpKey, setBumpKey] = useState(0);
  const lastTotalsRef = useRef<{ meal: number; session: number }>({
    meal: 0,
    session: 0,
  });

  // What MealCountsPanel renders. In live mode this is the server-fetched
  // meal-stats; in simulation it's an in-memory tally over the dedupe
  // map for the currently-selected (mealKey, mealDate), bucketed by the
  // person's meal category (computed offline from birthDate + event start).
  const displayStats: MealStats = useMemo(() => {
    if (!isSimulation) return stats;
    const seen = simDedupeRef.current.get(`${mealKey}|${mealDate}`);
    const meal = emptyTally();
    if (seen) {
      for (const catKey of seen.values()) {
        meal.total += 1;
        meal[catKey] += 1;
      }
    }
    return { meal, session: null };
    // simBump is read so the memo invalidates after each simulated scan.
  }, [isSimulation, stats, mealKey, mealDate, simBump]);

  const fetchStats = useCallback(async () => {
    if (!selectedEventId || !mealDate || !mealKey) return;
    // Simulation mode never reads from the real meal-stats endpoint —
    // its tally is the in-memory simCount synthesized below.
    if (isSimulation) return;
    setStatsLoading(true);
    try {
      const params = new URLSearchParams({
        eventId: selectedEventId,
        mealDate,
        mealType: MEAL_KEY_TO_TYPE[mealKey],
      });
      if (scanSession.session?.id) {
        params.set("scanSessionId", scanSession.session.id);
      }
      const res = await fetch(`/api/checkin/meal-stats?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as MealStats;
        const nextMeal = data.meal ?? emptyTally();
        const nextSession = data.session ?? null;
        const prevMealTotal = lastTotalsRef.current.meal;
        const prevSessionTotal = lastTotalsRef.current.session;
        const bumped =
          nextMeal.total !== prevMealTotal ||
          (nextSession?.total ?? 0) !== prevSessionTotal;
        lastTotalsRef.current = {
          meal: nextMeal.total,
          session: nextSession?.total ?? 0,
        };
        setStats({ meal: nextMeal, session: nextSession });
        if (bumped) setBumpKey((k) => k + 1);
      }
    } catch {
      /* leave previous stats in place */
    } finally {
      setStatsLoading(false);
    }
  }, [selectedEventId, mealDate, mealKey, scanSession.session?.id, isSimulation]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Re-pull stats whenever a new check-in lands (including from other devices).
  // Debounced so a burst from other kiosks coalesces into one server round-trip
  // instead of N — meal-stats does a full event scan, so 5 scans in 500ms
  // would otherwise stack 5 backend queries while the operator is still
  // working through their own line.
  const lastCheckinIdRef = useRef<string | null>(null);
  const statsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const top = realtime.checkins[0];
    if (!top) return;
    if (lastCheckinIdRef.current === top.id) return;
    lastCheckinIdRef.current = top.id;
    if (statsDebounceRef.current) clearTimeout(statsDebounceRef.current);
    statsDebounceRef.current = setTimeout(fetchStats, 500);
  }, [realtime.checkins, fetchStats]);
  useEffect(
    () => () => {
      if (statsDebounceRef.current) clearTimeout(statsDebounceRef.current);
    },
    []
  );

  // Live "session elapsed" ticker so the timer keeps moving without polling.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!scanSession.session) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [scanSession.session]);

  const sessionStartedAt = scanSession.session?.started_at ?? null;
  const sessionElapsedMs = sessionStartedAt
    ? Math.max(0, now - new Date(sessionStartedAt).getTime())
    : 0;

  const startResumeCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setResumeCountdown(Math.ceil(RESUME_DELAY_MS / 1000));
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
      // Keep the previous person's card visible — it stays as the "last
      // scanned" panel so the operator can re-confirm who they just let
      // through. Only the dedupe lock + countdown are released, so the next
      // QR (even the same one) is accepted and swaps the card in place.
      lastScannedRef.current = null;
      setResumeCountdown(null);
    }, RESUME_DELAY_MS);
  }, []);

  const processParsed = useCallback(
    async (parsed: ParsedQR) => {
      if (!scanSession.canScan || !scanSession.session) return;
      const dedupeKey =
        parsed.kind === "participantCode" ? parsed.participantCode : parsed.token;
      if (lastScannedRef.current === dedupeKey) return;
      lastScannedRef.current = dedupeKey;

      const seq = ++scanSeqRef.current;
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setResumeCountdown(null);

      // ── Simulation path ────────────────────────────────────────────────
      // No server round-trip: cache resolves the person, an in-memory Set
      // enforces the same "one meal per person per date" rule the real
      // verify route would. Nothing is persisted, so the operator can
      // rehearse a full meal flow with hardware scans without polluting the
      // real eckcm_checkins table or meal counts.
      if (isSimulation) {
        const cached = await cache.lookup(parsed);
        if (!cached) {
          setDisplay({
            ok: false,
            title: "Not in cache",
            detail: "Resync the e-pass cache or use a known participant.",
          });
          feedback("error");
          startResumeCountdown();
          return;
        }
        // Mirror the server rule: PAID / APPROVED / SUBMITTED are all servable
        // (a QR in hand means registration issued it). Only a deactivated PAID
        // pass is blocked — SUBMITTED passes are inactive by nature.
        {
          const simStatus = cached.registrationStatus;
          const simIsPaid = simStatus === "PAID" || simStatus === "APPROVED";
          const simServable = simIsPaid || simStatus === "SUBMITTED";
          if (!simServable || (simIsPaid && !cached.isActive)) {
            setDisplay({
              ok: false,
              title: "Cannot serve",
              subtitle: cached.personName,
              detail: !simServable
                ? `Registration is ${simStatus.toLowerCase()}`
                : "E-Pass is inactive",
            });
            feedback("error");
            startResumeCountdown();
            return;
          }
        }
        // Attendance-window gate (mirrors the server verify rule). Simulation
        // has no server round-trip, so enforce it here from the cached window —
        // unless "Allow off-window dates" is on (any issued QR is served).
        if (
          !allowOutsideWindow &&
          !withinStayWindow(mealDate, cached.stayStartDate, cached.stayEndDate)
        ) {
          setDisplay({
            ok: false,
            title: "Cannot serve",
            subtitle: cached.personName,
            detail:
              cached.stayStartDate && mealDate < cached.stayStartDate
                ? `Not attending yet — arrives ${cached.stayStartDate}`
                : `Not attending — stay ended ${cached.stayEndDate ?? ""}`,
            participantCode: cached.participantCode ?? null,
            gender: cached.gender ?? null,
          });
          feedback("error");
          startResumeCountdown();
          return;
        }

        const mealKeyId = `${mealKey}|${mealDate}`;
        const seen =
          simDedupeRef.current.get(mealKeyId) ?? new Map<string, MealCategoryKey>();
        const personKey = cached.participantCode ?? dedupeKey;
        const cat = computeMealCategory(cached.birthDate, cached.eventStartDate);
        const catKey: MealCategoryKey =
          cat === "adult" ? "general" : cat === "youth" ? "youth" : cat === "free" ? "free" : "unknown";

        if (seen.has(personKey)) {
          setDisplay({
            ok: true,
            variant: "duplicate",
            title: "Already simulated",
            subtitle: cached.personName,
            detail: cached.koreanName ?? undefined,
            participantCode: cached.participantCode ?? null,
            mealCategory: cat,
            gender: cached.gender ?? null,
          });
          feedback("duplicate");
          startResumeCountdown();
          return;
        }
        seen.set(personKey, catKey);
        simDedupeRef.current.set(mealKeyId, seen);

        // Persist a sandbox row so the live board and Scan Sessions reflect the
        // simulation in real time. Fire-and-forget: the kiosk's own count panel
        // stays driven by the in-memory tally above, this only feeds the
        // DB-backed views. The session is sandbox, so verify inserts
        // is_sandbox=true — fully isolated from real meal counts. Only fires on
        // the first scan of each person (we returned early on duplicates).
        void fetch("/api/checkin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...toVerifyBody(parsed),
            checkinType: "DINING",
            mealDate,
            mealType: MEAL_KEY_TO_TYPE[mealKey],
            scanSessionId: scanSession.session.id,
            allowOutsideWindow,
          }),
        }).catch(() => {
          /* best-effort — the simulation UI doesn't depend on this */
        });

        setDisplay({
          ok: true,
          title: "Welcome!",
          subtitle: cached.personName,
          detail: cached.koreanName ?? undefined,
          participantCode: cached.participantCode ?? null,
          mealCategory: cat,
          gender: cached.gender ?? null,
        });
        feedback("success");
        setSimBump((b) => b + 1);
        startResumeCountdown();
        return;
      }
      // ──────────────────────────────────────────────────────────────────

      // Cache-first optimistic display. When the participant is already in
      // the local IndexedDB cache AND looks valid (active + paid), show the
      // green "Welcome!" panel immediately and let verify reconcile in the
      // background. We don't flip `processing`, so the operator can scan the
      // next person right away — the typical case where this matters most.
      // Cache misses, or anything that doesn't look paid+active, keep the
      // old conservative path (spinner → server verdict).
      const cached = await cache.lookup(parsed);
      const cachedStatus = cached?.registrationStatus;
      const cachedIsPaid =
        cachedStatus === "PAID" || cachedStatus === "APPROVED";
      const cachedServable = cachedIsPaid || cachedStatus === "SUBMITTED";
      const optimistic = Boolean(
        cached &&
          cachedServable &&
          // Only paid passes require an active flag; SUBMITTED walk-ins are
          // inactive by nature and still flash green (server confirms).
          (!cachedIsPaid || cached.isActive) &&
          // Out-of-window meals must not flash green — let the server's
          // authoritative reject land instead (red "Cannot serve"). When
          // "Allow off-window dates" is on, the window no longer gates the
          // optimistic green (the server will accept it too).
          (allowOutsideWindow ||
            withinStayWindow(mealDate, cached.stayStartDate, cached.stayEndDate))
      );

      if (optimistic && cached) {
        setDisplay({
          ok: true,
          title: "Welcome!",
          subtitle: cached.personName,
          detail: cached.koreanName ?? undefined,
          participantCode: cached.participantCode ?? null,
          mealCategory: computeMealCategory(
            cached.birthDate,
            cached.eventStartDate
          ),
          gender: cached.gender ?? null,
        });
        feedback("success");
        startResumeCountdown();
      } else {
        setProcessing(true);
        setDisplay(
          cached
            ? {
                ok: true,
                title: "Confirming…",
                subtitle: cached.personName,
                detail: cached.koreanName ?? undefined,
                participantCode: cached.participantCode ?? null,
                mealCategory: computeMealCategory(
                  cached.birthDate,
                  cached.eventStartDate
                ),
                gender: cached.gender ?? null,
              }
            : null
        );
      }

      // Bound the verify round-trip. A hung serverless function or a dropped
      // connection would otherwise leave `await fetch` pending forever, so the
      // `finally` below never runs and `lastScannedRef` stays locked — the
      // operator sees scanning "freeze" until they refresh the page. Aborting
      // turns that into a normal rejected promise that flows to `catch`.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
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
            allowOutsideWindow,
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        // Drop responses for scans the operator has already moved past —
        // otherwise an in-flight verify could overwrite the next person's
        // result card with this one's late-arriving payload.
        if (scanSeqRef.current !== seq) return;
        if (res.ok) {
          // For optimistic scans only swap when the server has new info to
          // share (already_checked_in, a different name, etc.). A normal
          // "checked_in" reply with matching name is the happy path and the
          // green panel is already correct — leave it alone so we don't
          // flash a re-render.
          if (optimistic && data.status === "checked_in") {
            setDisplay((prev) =>
              prev
                ? {
                    ...prev,
                    mealCategory: data.person?.mealCategory ?? prev.mealCategory,
                  }
                : prev
            );
          } else {
            // Always sound the distinct duplicate buzzer for a repeat scan —
            // even on optimistic scans (which already chimed success up front)
            // — so the operator unmistakably hears "already served". Fresh
            // check-ins only beep here on the conservative (non-optimistic)
            // path; optimistic ones already chimed.
            if (data.status === "already_checked_in") {
              feedback("duplicate");
            } else if (!optimistic) {
              feedback(data.status === "checked_in" ? "success" : "warn");
            }
            setDisplay({
              ok: data.status !== "error",
              title:
                data.status === "checked_in"
                  ? "Welcome!"
                  : data.status === "already_checked_in"
                    ? "Already checked in"
                    : "Done",
              variant:
                data.status === "already_checked_in" ? "duplicate" : undefined,
              subtitle: data.person?.name,
              detail: data.person?.koreanName ?? undefined,
              participantCode: data.person?.participantCode ?? null,
              mealCategory: data.person?.mealCategory ?? null,
              gender: data.person?.gender ?? null,
            });
          }
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
        if (scanSeqRef.current !== seq) return;
        feedback("error");
        setDisplay({ ok: false, title: "Network error", detail: "Try again" });
      } finally {
        clearTimeout(timeoutId);
        // Only the most recent scan owns the dedupe lock + countdown. If a
        // newer scan has superseded this one it already armed its own
        // countdown, so releasing here would let a stale result swap in.
        if (scanSeqRef.current === seq) {
          setProcessing(false);
          // Optimistic scans armed their countdown up front (line ~774); only
          // the conservative path still needs to release the dedupe lock here.
          if (!optimistic) startResumeCountdown();
        }
      }
    },
    [
      scanSession.canScan,
      scanSession.session,
      mealDate,
      mealKey,
      cache,
      startResumeCountdown,
      isSimulation,
      allowOutsideWindow,
    ]
  );

  const processRawValue = useCallback(
    async (rawValue: string) => {
      const parsed = parseQRValue(rawValue);
      if (!parsed) {
        console.warn("[kiosk] unparseable scan", {
          length: rawValue.length,
          raw: rawValue,
          json: JSON.stringify(rawValue),
        });
        // Do NOT flash the big red "Invalid QR" overlay — at the meal desk a
        // red error erodes the operators' trust in the count. The parser
        // already de-noises IME/reader corruption, so a null here is a genuine
        // non-participant scan. Show a quiet "scan again" prompt and a soft
        // warn tone; keep the session live for the next scan.
        feedback("warn");
        setDisplay({
          ok: false,
          title: "Scan again",
          detail: "QR not recognized — line it up and rescan",
        });
        if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = setTimeout(() => {
          setDisplay(null);
          lastScannedRef.current = null;
        }, 1500);
        return;
      }
      await processParsed(parsed);
    },
    [processParsed]
  );

  // Hardware scanner stays armed in hardware mode regardless of focus, because
  // USB scanners blast Enter at the active window.
  useHidScanner({
    enabled: inputMode === "hardware" && scanSession.canScan,
    onScan: processRawValue,
  });

  const handleCameraScan = useCallback(
    (codes: { rawValue: string }[]) => {
      if (!codes.length) return;
      processRawValue(codes[0].rawValue);
    },
    [processRawValue]
  );

  const handleSearchSelect = useCallback(
    (participantCode: string) => {
      if (processing) return;
      processParsed({ kind: "participantCode", participantCode });
    },
    [processing, processParsed]
  );

  const enterFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    }
  }, []);

  const startActiveSession = useCallback(async () => {
    if (!selectedEventId) return;
    // Unlock iOS audio + speech from this tap so later scan beeps and the
    // spoken "Re-entry" cue actually play on iPad.
    primeAudio();
    setSwitchingMode(true);
    try {
      const args = {
        eventId: selectedEventId,
        kind: MEAL_KIND[mealKey],
        mealDate,
        label: `${MEAL_LABEL[mealKey]} · ${mealDate} · Kiosk${isSimulation ? " · Simulation" : ""}`,
        isSandbox: isSimulation,
      };
      let started = await scanSession.start(args);
      if (!started) {
        // Most common cause of a "nothing happened" Start tap is a stale
        // Supabase access token after the iPad slept: the POST 401s and the
        // hook silently set its error state. Force a token refresh and retry
        // once before surfacing anything to the operator.
        try {
          await createClient().auth.getSession();
        } catch {
          // ignore — retry will reveal whether auth is really the problem
        }
        started = await scanSession.start(args);
      }
      if (!started) {
        // Both attempts failed — make the failure visible instead of leaving
        // the operator staring at an unresponsive button.
        toast.error(
          scanSession.error ?? "Couldn't start the session. Check the connection and try again."
        );
      }
    } finally {
      setSwitchingMode(false);
    }
  }, [selectedEventId, mealKey, mealDate, scanMode, scanSession, isSimulation]);

  // Hard Reset — permanently clears the recorded live (non-sandbox) check-ins
  // for the currently selected meal slot (event + date + meal) so the live
  // count restarts from zero. Registrations / payments are never touched. Any
  // check-in operator may run it; the server audit-logs every reset.
  const handleHardReset = useCallback(async () => {
    if (!selectedEventId) return;
    try {
      const res = await fetch("/api/checkin/meal-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          mealDate,
          mealType: MEAL_KEY_TO_TYPE[mealKey],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `Hard reset failed (${res.status})`);
        return;
      }
      const n = data.deleted ?? 0;
      toast.success(
        `Cleared ${n} ${MEAL_LABEL[mealKey]} check-in${n === 1 ? "" : "s"} for ${mealDate}`
      );
      // Re-pull the authoritative meal count so the panel drops to zero.
      fetchStats();
    } catch {
      toast.error("Network error during hard reset");
    }
  }, [selectedEventId, mealDate, mealKey, fetchStats]);

  // Reset All Meals — clears every recorded live (non-sandbox) DINING check-in
  // for the whole event (all dates + all meals) in one shot. Same audit/role
  // rules as the per-meal reset, but gated behind a typed confirmation.
  const handleResetAll = useCallback(async () => {
    if (!selectedEventId) return;
    if (resetAllConfirmText.trim().toUpperCase() !== RESET_ALL_CONFIRM) return;
    try {
      const res = await fetch("/api/checkin/event-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: selectedEventId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `Reset all failed (${res.status})`);
        return;
      }
      const n = data.deleted ?? 0;
      toast.success(
        `Cleared all ${n} meal check-in${n === 1 ? "" : "s"} for this event`
      );
      setResetAllDialogOpen(false);
      setResetAllConfirmText("");
      fetchStats();
    } catch {
      toast.error("Network error during reset");
    }
  }, [selectedEventId, resetAllConfirmText, fetchStats]);

  const constraints = devices.selectedDeviceId
    ? { deviceId: { exact: devices.selectedDeviceId } }
    : { facingMode: { ideal: cameraFacing } };

  const cameraReady =
    inputMode === "camera" && camera.status === "granted" && scanSession.canScan;

  return (
    <div
      className={`fixed inset-0 flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 ${
        isSimulation ? "ring-4 ring-purple-400 dark:ring-purple-600 ring-inset" : ""
      }`}
    >
      {/* Top bar — slim, dense setup controls. */}
      <header className="border-b bg-card/70 backdrop-blur px-3 py-2 flex items-center gap-2 flex-wrap">
        <Button asChild variant="ghost" size="icon" className="h-11 w-11">
          <Link href="/admin/checkin" aria-label="Back to check-in">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>

        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
          <SelectTrigger className="w-[220px] h-11 text-base">
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

        {/* Unrestricted meal date — any date is allowed (setup-day dry runs,
            backfills) so this is a free native date input, not a list pinned
            to the event window. */}
        <input
          type="date"
          value={mealDate}
          onChange={(e) => {
            if (e.target.value) setMealDate(e.target.value);
          }}
          aria-label="Meal date"
          className="h-11 w-[180px] rounded-md border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />

        <Tabs value={mealKey} onValueChange={(v) => setMealKey(v as MealKey)}>
          <TabsList className="h-11">
            {MEAL_KEYS.map((k) => (
              <TabsTrigger key={k} value={k} className="gap-1.5 px-3 text-base">
                {MEAL_ICON[k]}
                <span className="hidden md:inline">{MEAL_LABEL[k]}</span>
                {suggestMealKey(schedule) === k && (
                  <Sparkles className="h-3 w-3 text-amber-500" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Allow off-window dates — when on (default), any QR we issued is
            served regardless of the participant's stay window. */}
        <div className="flex items-center gap-2 rounded-md border px-3 h-11">
          <Switch
            id="allow-off-window"
            checked={allowOutsideWindow}
            onCheckedChange={updateAllowOutsideWindow}
          />
          <Label
            htmlFor="allow-off-window"
            className="text-sm cursor-pointer whitespace-nowrap"
          >
            Allow off-window dates
          </Label>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Badge
            variant={isOnline ? "default" : "destructive"}
            className="gap-1 h-8 text-sm px-2.5"
          >
            {isOnline ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" />
            )}
            {isOnline ? "Online" : "Offline"}
          </Badge>

          {isFullscreen ? (
            <Button
              variant="outline"
              size="lg"
              onClick={exitFullscreen}
              className="h-11 px-4 gap-2 text-base"
            >
              <Minimize2 className="h-5 w-5" />
              <span className="hidden sm:inline">Exit Fullscreen</span>
            </Button>
          ) : (
            <Button
              variant="default"
              size="lg"
              onClick={enterFullscreen}
              className="h-11 px-4 gap-2 text-base"
            >
              <Maximize2 className="h-5 w-5" />
              <span className="hidden sm:inline">Fullscreen</span>
            </Button>
          )}
        </div>
      </header>

      {/* Session strip — lifecycle, timer, and live session counter. */}
      <div
        className={`border-b px-3 py-2 flex items-center gap-3 flex-wrap ${
          isSimulation
            ? "bg-purple-50/60 dark:bg-purple-950/30"
            : "bg-card/40"
        }`}
      >
        {scanSession.session ? (
          <>
            <Badge
              className={
                scanSession.canScan
                  ? "gap-1 bg-green-600 hover:bg-green-700 h-8 text-sm"
                  : "gap-1 h-8 text-sm"
              }
              variant={scanSession.canScan ? "default" : "secondary"}
            >
              {scanSession.canScan ? (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Live
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  Paused
                </>
              )}
            </Badge>

            {isSimulation && (
              <Badge
                variant="outline"
                className="gap-1 h-8 text-sm border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-300"
              >
                <Beaker className="h-3.5 w-3.5" /> Simulation — not recorded
              </Badge>
            )}

            <Badge
              variant="outline"
              className="h-8 text-sm tabular-nums font-mono text-muted-foreground"
            >
              {KIOSK_VERSION_LABEL}
            </Badge>

            {sessionStartedAt && (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Started {formatClock(sessionStartedAt)}
              </span>
            )}

            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Timer className="h-4 w-4" />
              {formatElapsed(sessionElapsedMs)}
            </span>

            {stats.session && (
              <Badge
                variant="secondary"
                className="gap-1 h-8 text-sm px-3 tabular-nums"
              >
                Session: <span className="font-bold">{stats.session.total}</span>
              </Badge>
            )}

            <div className="ml-auto flex items-center gap-2">
              {scanSession.canScan ? (
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => {
                    scanSession.pause();
                    // Hitting Pause cancels any armed End.
                    setEndArmed(false);
                    if (endArmedTimerRef.current) clearTimeout(endArmedTimerRef.current);
                  }}
                  className="h-11 gap-1.5 px-4"
                >
                  <Pause className="h-4 w-4" /> Pause
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={() => {
                    primeAudio();
                    scanSession.resume();
                    setEndArmed(false);
                    if (endArmedTimerRef.current) clearTimeout(endArmedTimerRef.current);
                  }}
                  className="h-11 gap-1.5 px-4"
                >
                  <Play className="h-4 w-4" /> Resume
                </Button>
              )}
              <Button
                size="lg"
                variant={endArmed ? "destructive" : "outline"}
                onClick={() => {
                  if (endArmed) {
                    // 2nd press → confirm dialog.
                    setEndDialogOpen(true);
                    return;
                  }
                  // 1st press → pause + arm. Operator now sees a Resume
                  // button beside it and "Confirm End" on this one.
                  if (scanSession.canScan) scanSession.pause();
                  setEndArmed(true);
                  if (endArmedTimerRef.current) clearTimeout(endArmedTimerRef.current);
                  endArmedTimerRef.current = setTimeout(
                    () => setEndArmed(false),
                    5000
                  );
                }}
                className={`h-11 gap-1.5 px-4 ${
                  endArmed
                    ? "animate-pulse"
                    : "border-destructive text-destructive hover:bg-destructive/10"
                }`}
              >
                <Square className="h-4 w-4" />{" "}
                {endArmed ? "Confirm End" : "End"}
              </Button>
              <AlertDialog
                open={endDialogOpen}
                onOpenChange={(open) => {
                  setEndDialogOpen(open);
                  if (!open) setEndArmed(false);
                }}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>End this kiosk session?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Scanning will stop immediately and the session will be
                      closed. You can review the check-ins it recorded under{" "}
                      <span className="font-mono">Scan Sessions</span> later.
                      Use <strong>Resume</strong> instead if you only need a
                      short break.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        const endedId = scanSession.session?.id ?? null;
                        await scanSession.end();
                        setEndArmed(false);
                        setEndDialogOpen(false);
                        if (endArmedTimerRef.current) clearTimeout(endArmedTimerRef.current);
                        if (endedId) {
                          // Hand the operator a printable / exportable
                          // summary of the session they just closed.
                          router.push(
                            `/admin/checkin/scan-sessions/${endedId}`
                          );
                        }
                      }}
                    >
                      End session
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        ) : (
          <>
            <span className="text-base text-muted-foreground">
              No {isSimulation ? "simulation" : "live"} session
            </span>
            {!isSimulation && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="lg"
                  disabled={!selectedEventId}
                  onClick={() => setResetDialogOpen(true)}
                  className="h-11 gap-1.5 px-4 border-destructive text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" /> Hard Reset
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  disabled={!selectedEventId}
                  onClick={() => setResetAllDialogOpen(true)}
                  className="h-11 gap-1.5 px-4 border-destructive text-destructive hover:bg-destructive/10"
                >
                  <AlertOctagon className="h-4 w-4" /> Reset All Meals
                </Button>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <Tabs
                value={scanMode}
                onValueChange={(v) => updateScanMode(v as ScanMode)}
              >
                <TabsList
                  className={`h-12 ${
                    isSimulation
                      ? "bg-purple-100 dark:bg-purple-950"
                      : "bg-emerald-100/60 dark:bg-emerald-950/40"
                  }`}
                >
                  <TabsTrigger
                    value="live"
                    className="gap-1.5 px-4 text-base"
                  >
                    <Radio className="h-4 w-4" />
                    Live
                  </TabsTrigger>
                  <TabsTrigger
                    value="simulation"
                    className="gap-1.5 px-4 text-base"
                  >
                    <Beaker className="h-4 w-4" />
                    Simulation
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                size="lg"
                className="h-12 px-6 text-base"
                disabled={!selectedEventId || switchingMode}
                onClick={startActiveSession}
              >
                {switchingMode ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Play className="h-5 w-5 mr-2" />
                )}
                Start {MEAL_LABEL[mealKey]}{" "}
                {isSimulation ? "Simulation" : "Kiosk"}
              </Button>
            </div>

            <AlertDialog
              open={resetDialogOpen}
              onOpenChange={setResetDialogOpen}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Hard reset {MEAL_LABEL[mealKey]} records?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes every recorded{" "}
                    <strong>{MEAL_LABEL[mealKey]}</strong> check-in for{" "}
                    <span className="font-mono">{mealDate}</span> at this event —
                    currently <strong>{displayStats.meal.total}</strong> served —
                    so the live count restarts from zero. Registrations and
                    payments are not affected. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleHardReset}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Clear records
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
              open={resetAllDialogOpen}
              onOpenChange={(open) => {
                setResetAllDialogOpen(open);
                if (!open) setResetAllConfirmText("");
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset ALL meal records?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes{" "}
                    <strong>every recorded meal check-in</strong> (all dates, all
                    meals) for{" "}
                    <strong>
                      {events.find((e) => e.id === selectedEventId)?.name_en ??
                        "this event"}
                    </strong>{" "}
                    so every meal count restarts from zero. Main-desk check-ins,
                    registrations and payments are not affected. This cannot be
                    undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-2">
                  <label
                    htmlFor="kiosk-reset-all-confirm"
                    className="text-sm font-medium"
                  >
                    Type <span className="font-mono">{RESET_ALL_CONFIRM}</span> to
                    confirm
                  </label>
                  <Input
                    id="kiosk-reset-all-confirm"
                    value={resetAllConfirmText}
                    onChange={(e) => setResetAllConfirmText(e.target.value)}
                    placeholder={RESET_ALL_CONFIRM}
                    autoFocus
                    className="mt-1.5"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleResetAll}
                    disabled={
                      resetAllConfirmText.trim().toUpperCase() !==
                      RESET_ALL_CONFIRM
                    }
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Clear all records
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>

      {/* Main: scanner + manual fallback (left), big counts + recent (right). */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_440px] xl:grid-cols-[1fr_500px] overflow-hidden">
        <section className="relative flex flex-col gap-3 p-4 lg:p-5 overflow-hidden">
          {/* Input mode + camera facing — directly above the viewport. */}
          <div className="flex items-center gap-2 flex-wrap">
            <Tabs
              value={inputMode}
              onValueChange={(v) => updateInputMode(v as InputMode)}
            >
              <TabsList className="h-11">
                <TabsTrigger value="hardware" className="gap-1.5 px-4 text-base">
                  <Keyboard className="h-4 w-4" />
                  Hardware
                </TabsTrigger>
                <TabsTrigger value="camera" className="gap-1.5 px-4 text-base">
                  <Camera className="h-4 w-4" />
                  Camera
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {inputMode === "camera" && (
              <Tabs
                value={cameraFacing}
                onValueChange={(v) => updateCameraFacing(v as CameraFacing)}
              >
                <TabsList className="h-11">
                  <TabsTrigger value="environment" className="px-3 text-base">
                    Back
                  </TabsTrigger>
                  <TabsTrigger value="user" className="px-3 text-base">
                    Front
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            <span className="ml-auto text-sm text-muted-foreground hidden md:inline">
              {inputMode === "hardware"
                ? "Aim USB / Bluetooth scanner at the QR code"
                : "Hold the QR code up to the camera"}
            </span>
          </div>

          {/* Scan viewport */}
          <div className="relative flex-1 min-h-[320px] rounded-3xl overflow-hidden border-4 border-slate-200 dark:border-slate-800 shadow-2xl bg-slate-900">
            {!scanSession.session ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-100 dark:bg-slate-900 text-slate-500">
                <Pause className="h-16 w-16 opacity-60" />
                <p className="text-xl font-medium">
                  Start a {isSimulation ? "simulation" : "live"} session to begin
                </p>
                <p className="text-sm">
                  {MEAL_LABEL[mealKey]} · {mealDate}
                </p>
              </div>
            ) : !scanSession.canScan ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-100 dark:bg-slate-900 text-slate-500">
                <Pause className="h-16 w-16 opacity-60" />
                <p className="text-xl font-medium">Scanning paused</p>
                <p className="text-sm">Tap Resume to continue scanning</p>
              </div>
            ) : inputMode === "hardware" ? (
              <SurveillanceCamera
                active
                facingMode="user"
                // Hardware scanning never needs the camera — if the surveillance
                // preview can't open (no camera / denied / in use), show a calm
                // "ready" panel instead of a scary "Camera unavailable" frame.
                fallback={
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-100 dark:bg-slate-900 text-slate-500">
                    <Keyboard className="h-16 w-16 opacity-60" />
                    <p className="text-xl font-medium">Ready to scan</p>
                    <p className="text-sm">Scan a QR code with the hardware scanner</p>
                  </div>
                }
              />
            ) : cameraReady ? (
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
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-900">
                <p className="text-muted-foreground">
                  Allow camera to start scanning
                </p>
              </div>
            )}

            {processing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                <Loader2 className="h-20 w-20 animate-spin" />
              </div>
            )}
          </div>

          {/* Manual fallback search */}
          <ParticipantSearch
            participants={roster}
            onSelect={handleSearchSelect}
            disabled={processing || !scanSession.canScan}
            loading={rosterLoading}
          />

          {/* Camera selector (only in camera mode) */}
          {inputMode === "camera" && camera.status === "granted" && (
            <CameraSelect
              devices={devices.devices}
              value={devices.selectedDeviceId}
              onChange={devices.setSelectedDeviceId}
            />
          )}

          {/* Cache status / resync — kiosk-station-style (always expanded) */}
          <CacheStatusBar
            status={cache.status}
            count={cache.count}
            onResync={cache.refresh}
          />
        </section>

        {/* Right column — result panel + counts + recent. */}
        <aside className="flex flex-col border-t lg:border-t-0 lg:border-l bg-card/40 overflow-hidden">
          <ResultPanel
            display={display}
            processing={processing}
            resumeCountdown={resumeCountdown}
          />
          <MealCountsPanel
            mealLabel={MEAL_LABEL[mealKey]}
            stats={displayStats}
            loading={statsLoading}
            isSimulation={isSimulation}
            bumpKey={bumpKey}
            hasSession={Boolean(scanSession.session)}
          />
          <div className="flex flex-col border-t flex-1 min-h-0">
            <div className="px-4 py-2 border-b flex items-center justify-between">
              <p className="text-sm font-semibold">Recent Check-ins</p>
              <Badge variant="outline" className="text-xs">
                Live
              </Badge>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <RecentCheckins checkins={recentResults} />
            </div>
          </div>
        </aside>
      </main>

      {/* Tab-hidden warning. While the page isn't the foreground tab, HID
          keystrokes go to whichever window is focused — i.e. nothing
          lands here. The banner appears as soon as the tab loses
          visibility (covers minimized window, switched tab, locked
          screen, OS app switch on iPadOS) and vanishes on return. */}
      {tabHidden && scanSession.session && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-amber-500/95 text-amber-950 select-none"
        >
          <AlertOctagon className="h-32 w-32 mb-4" />
          <p className="text-4xl font-extrabold tracking-tight">
            Kiosk tab is not in focus
          </p>
          <p className="text-xl mt-3 max-w-2xl text-center px-6">
            HID scans only land on the foreground tab. Bring this tab back
            to the front to keep scanning.
          </p>
        </div>
      )}

      {/* Floating Exit Fullscreen button — iPad operators leave fullscreen
          without hunting the header. Bottom-right so it sits on the
          counts/right column. */}
      {isFullscreen && (
        <Button
          onClick={exitFullscreen}
          size="lg"
          variant="secondary"
          className="fixed bottom-6 right-6 z-50 h-14 px-5 gap-2 text-base shadow-2xl border border-slate-300 dark:border-slate-700"
        >
          <Minimize2 className="h-5 w-5" />
          Exit Fullscreen
        </Button>
      )}
    </div>
  );
}

interface ResultPanelProps {
  display: DisplayedResult | null;
  processing: boolean;
  resumeCountdown: number | null;
}

/**
 * The big "who just scanned" card. Lives in the right rail (above the meal
 * counts) so the operator's eye doesn't have to move off the QR they're
 * pointing at — the camera/CCTV viewport on the left stays clean.
 *
 * Idle state still renders a placeholder block so the panel always occupies
 * the same vertical real estate and the layout doesn't jump on every scan.
 */
function ResultPanel({ display, processing, resumeCountdown }: ResultPanelProps) {
  if (!display) {
    return (
      <div className="border-b px-4 py-6 flex flex-col items-center justify-center text-center min-h-[200px] bg-slate-50/60 dark:bg-slate-950/40">
        {processing ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            <p className="mt-3 text-sm uppercase tracking-widest text-muted-foreground">
              Confirming…
            </p>
          </>
        ) : (
          <>
            <UserRound className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-3 text-sm uppercase tracking-widest text-muted-foreground">
              Awaiting scan
            </p>
          </>
        )}
      </div>
    );
  }

  const tone: "success" | "warning" | "duplicate" =
    display.variant ?? (display.ok ? "success" : "warning");
  const toneBg =
    tone === "success"
      ? "bg-green-600/95"
      : tone === "duplicate"
        ? "bg-orange-500/95"
        : "bg-red-600/95";

  return (
    <div
      key={display.title + (display.subtitle ?? "")}
      className={`border-b px-4 py-6 flex flex-col items-center text-center text-white animate-in fade-in zoom-in duration-150 ${toneBg}`}
    >
      {tone === "warning" ? (
        <AlertOctagon className="h-16 w-16 mb-2 drop-shadow" />
      ) : (
        <CheckCircle2 className="h-16 w-16 mb-2 drop-shadow" />
      )}
      <p className="text-3xl font-extrabold tracking-tight">{display.title}</p>
      {display.subtitle && (
        <p className="text-2xl font-semibold mt-2">{display.subtitle}</p>
      )}
      {display.detail && (
        <p className="text-lg opacity-90 mt-1">{display.detail}</p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
        {(display.gender === "MALE" || display.gender === "FEMALE") && (
          <Badge
            variant="outline"
            className={`bg-white text-base px-3 py-1 border-2 ${
              display.gender === "MALE"
                ? "border-blue-400 text-blue-700"
                : "border-rose-400 text-rose-700"
            }`}
          >
            {display.gender === "MALE" ? "Male" : "Female"}
          </Badge>
        )}
        {display.mealCategory && (
          <Badge
            variant="outline"
            className={`bg-white text-base px-3 py-1 border-2 ${
              display.mealCategory === "adult"
                ? "border-emerald-400 text-emerald-700"
                : display.mealCategory === "youth"
                  ? "border-amber-400 text-amber-700"
                  : "border-gray-400 text-gray-700"
            }`}
          >
            {display.mealCategory === "adult"
              ? "General"
              : display.mealCategory === "youth"
                ? "Youth"
                : "Free"}
          </Badge>
        )}
      </div>
      {resumeCountdown !== null && (
        <p className="mt-3 text-xs font-medium tracking-widest uppercase opacity-90">
          Ready for next in {resumeCountdown}…
        </p>
      )}
    </div>
  );
}

interface MealCountsPanelProps {
  mealLabel: string;
  stats: MealStats;
  loading: boolean;
  isSimulation: boolean;
  bumpKey: number;
  hasSession: boolean;
}

function MealCountsPanel({
  mealLabel,
  stats,
  loading,
  isSimulation,
  bumpKey,
  hasSession,
}: MealCountsPanelProps) {
  return (
    <div className="px-4 pt-4 pb-3 space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {isSimulation
              ? "Meal-wide — sandbox excluded"
              : `${mealLabel} · Total Served`}
          </p>
          <p
            key={`meal-${bumpKey}`}
            className="text-7xl font-black tabular-nums leading-none mt-1 animate-in zoom-in-95 duration-200"
          >
            {stats.meal.total}
          </p>
        </div>
        {loading && (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mb-2" />
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <CountTile label="General" value={stats.meal.general} tone="general" />
        <CountTile label="Youth" value={stats.meal.youth} tone="youth" />
        <CountTile label="Free" value={stats.meal.free} tone="free" />
      </div>

      {hasSession && stats.session && (
        <div
          className={`rounded-lg border px-3 py-3 ${
            isSimulation
              ? "border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-950/40"
              : "border-slate-200 bg-muted/40 dark:border-slate-700"
          }`}
        >
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            This session{isSimulation ? " · simulation" : ""}
          </p>
          <div className="flex items-baseline gap-3 flex-wrap">
            <p
              key={`sess-${bumpKey}`}
              className="text-4xl font-extrabold tabular-nums leading-none animate-in zoom-in-95 duration-200"
            >
              {stats.session.total}
            </p>
            <p className="text-sm text-muted-foreground tabular-nums">
              G {stats.session.general} · Y {stats.session.youth} · F{" "}
              {stats.session.free}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const COUNT_TONE: Record<"general" | "youth" | "free", string> = {
  general:
    "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100",
  youth:
    "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100",
  free: "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100",
};

function CountTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "general" | "youth" | "free";
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-3 flex flex-col items-start ${COUNT_TONE[tone]}`}
    >
      <span className="text-xs uppercase tracking-wider opacity-80">{label}</span>
      <span className="text-5xl font-extrabold tabular-nums leading-tight mt-0.5">
        {value}
      </span>
    </div>
  );
}
