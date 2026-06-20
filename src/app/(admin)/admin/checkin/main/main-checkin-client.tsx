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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Beaker, Radio } from "lucide-react";
import {
  ScanResultCard,
  type ScanResult,
} from "@/components/checkin/scan-result-card";
import { RecentCheckins } from "@/components/checkin/recent-checkins";
import {
  ScannerShell,
  type CameraSelectController,
} from "@/components/checkin/scanner-shell";
import { CameraSelect } from "@/components/checkin/camera-select";
import {
  ParticipantSearch,
  type SearchableParticipant,
} from "@/components/checkin/participant-search";
import { CacheStatusBar } from "@/components/checkin/cache-status-bar";
import { feedback } from "@/lib/checkin/scanner-feedback";
import { toVerifyBody, type ParsedQR } from "@/lib/checkin/qr-parser";
import { useEpassCache } from "@/lib/checkin/use-epass-cache";
import { useScanSession } from "@/lib/checkin/use-scan-session";
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
  const [mode, setMode] = useState<"live" | "test">("live");
  const [switchingMode, setSwitchingMode] = useState(false);
  // Camera selector is hoisted out of the scanner so it can sit below search.
  const [cameraSelect, setCameraSelect] =
    useState<CameraSelectController | null>(null);
  // Searchable roster for manual check-in by name / phone / email / reg code.
  const [roster, setRoster] = useState<SearchableParticipant[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Test mode routes scans through a sandbox scan session (is_sandbox=true) so
  // nothing lands in real attendance. Live mode submits with no session.
  const sandbox = useScanSession({
    storageKey: "checkin.scanSessionId.main-sandbox",
  });

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
            registration: l.registrationStatus
              ? { status: l.registrationStatus }
              : undefined,
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

  // Switching events while in test mode would point scans at a sandbox session
  // bound to the old event — drop back to live so the operator re-arms test
  // explicitly for the new event.
  useEffect(() => {
    if (mode === "test") setMode("live");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  // Load the searchable roster once per event for manual check-in search.
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
    // Resume the camera but keep the last result (and its Fast Track / On Site
    // line banner) on screen. It stays until the NEXT scan replaces it — the
    // operator never loses the line they need to route the current person.
    resumeTimerRef.current = setTimeout(() => {
      setScanning(true);
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
      // Mirror the server's MAIN line-router rule: PAID/APPROVED → Fast Track,
      // SUBMITTED → On Site, anything else → hard stop. An inactive pass only
      // blocks paid registrations (SUBMITTED walk-ins are inactive by nature).
      const status = cached.registrationStatus;
      const isPaid = status === "PAID" || status === "APPROVED";
      if (!isPaid && status !== "SUBMITTED") {
        return {
          status: "error",
          person: { name: cached.personName, koreanName: cached.koreanName },
          registration: { status },
          errorMessage: `Registration is ${status.toLowerCase()}`,
          timestamp: new Date(),
          isOffline: true,
        };
      }
      if (isPaid && !cached.isActive) {
        return {
          status: "error",
          person: { name: cached.personName, koreanName: cached.koreanName },
          registration: { status },
          errorMessage: "E-Pass is inactive",
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
        registration: { status: cached.registrationStatus },
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
          registration: { status: cached.registrationStatus },
          confirmationCode: cached.confirmationCode,
          checkinType: "MAIN",
          timestamp: new Date(),
          isPending: true,
        });
        feedback("success");
      }

      let result: ScanResult;

      // Test mode goes through the sandbox scan session and never falls back to
      // the offline pending queue (which would pollute real attendance on sync).
      const testMode = mode === "test" && !!sandbox.session;

      if (isOnline) {
        try {
          const res = await fetch("/api/checkin/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...toVerifyBody(parsed),
              checkinType: "MAIN",
              ...(testMode ? { scanSessionId: sandbox.session!.id } : {}),
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
          result = testMode
            ? {
                status: "error",
                errorMessage: "Test mode needs a connection",
                timestamp: new Date(),
                isSandbox: true,
              }
            : await handleOfflineScan(parsed);
        }
      } else if (testMode) {
        result = {
          status: "error",
          errorMessage: "Test mode needs a connection",
          timestamp: new Date(),
          isSandbox: true,
        };
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
        registrationStatus: result.registration?.status ?? null,
      });

      setProcessing(false);
      startResumeCountdown();
    },
    [isOnline, cache, handleOfflineScan, startResumeCountdown, mode, sandbox.session]
  );

  const handleScanningChange = useCallback((next: boolean) => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setResumeCountdown(null);
    setScanning(next);
    if (next) setScanResult(null);
  }, []);

  const handleModeChange = useCallback(
    async (next: "live" | "test") => {
      if (next === mode || switchingMode) return;
      if (next === "test") {
        if (!selectedEventId) return;
        setSwitchingMode(true);
        try {
          // Reuse an existing sandbox session for this event; otherwise start
          // a fresh one. A session from another event is replaced.
          const needsNew =
            !sandbox.session ||
            sandbox.session.event_id !== selectedEventId ||
            sandbox.status === "ENDED";
          if (needsNew) {
            const started = await sandbox.start({
              eventId: selectedEventId,
              kind: "OTHER",
              label: "Main check-in · test",
              isSandbox: true,
            });
            if (!started) return; // start failed — stay in live mode
          } else if (sandbox.status === "PAUSED") {
            await sandbox.resume();
          }
          setMode("test");
        } finally {
          setSwitchingMode(false);
        }
      } else {
        // Leaving test: end the sandbox session so it doesn't linger.
        setSwitchingMode(true);
        try {
          if (sandbox.session && sandbox.status !== "ENDED") {
            await sandbox.end();
          }
          setMode("live");
        } finally {
          setSwitchingMode(false);
        }
      }
    },
    [mode, switchingMode, selectedEventId, sandbox]
  );

  // Manual check-in via the search dropdown — selecting a participant runs the
  // exact same check-in flow as a camera scan. The code comes from the roster,
  // so it's already a valid participant code.
  const handleSearchSelect = useCallback(
    (participantCode: string) => {
      if (processing) return;
      handleScan({ kind: "participantCode", participantCode });
    },
    [processing, handleScan]
  );

  const statusBar = (
    /*
      Compact status row: event label + connectivity + pending-sync. The cache
      details (count, resync) stay hidden behind the toggle so this row never
      eats vertical space the scanner needs on a phone.
    */
    <div className="flex flex-wrap items-center gap-2">
      {events.length > 1 ? (
        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
          <SelectTrigger className="h-8 w-auto min-w-[180px] text-sm">
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
      ) : (
        events[0] && (
          <span className="text-sm font-medium">
            {events[0].name_en} ({events[0].year})
          </span>
        )
      )}

      <CacheStatusBar
        status={cache.status}
        count={cache.count}
        onResync={cache.refresh}
        pendingSyncCount={pendingSyncCount}
        onSyncPending={syncPendingCheckins}
        syncing={syncing}
        collapsible
        className="flex-1"
      />
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/*
        Phone-first: the camera sits at the very top, then the scan result
        (with the Fast Track / On Site line banner), then the compact status
        row, then recent check-ins — all stacked so everything fits one screen.
        On desktop it splits into a two-column station layout.
      */}
      <div className="space-y-3">
        {/*
          Order is strictly: camera → Fast Track / On Site banner → manual
          search → Test/Live switch → status. The camera owns the very top of
          the phone screen; everything else stacks below it. In test mode the
          scanner gets a purple ring so the operator can't miss it.
        */}
        <div
          className={
            mode === "test"
              ? "rounded-lg ring-2 ring-purple-400 dark:ring-purple-600"
              : undefined
          }
        >
          <ScannerShell
            onScan={handleScan}
            scanning={scanning}
            onScanningChange={handleScanningChange}
            processing={processing}
            resumeCountdown={resumeCountdown}
            defaultCameraFacing="environment"
            cameraStorageNamespace="main"
            // Phone-first: camera goes at the very top, so the Camera/QR Scanner
            // mode toggle is hidden. Hardware-scanner stations use /kiosk.
            showInputModeToggle={false}
            // Manual input is hoisted out (below the line banner) so it sits
            // right under the result, not at the bottom of the scanner block.
            showManualInput={false}
            // Camera selector is hoisted out too — rendered below search.
            onCameraSelectChange={setCameraSelect}
          />
        </div>
        <ScanResultCard result={scanResult} minimal />
        <div className="pb-4">
          <ParticipantSearch
            participants={roster}
            onSelect={handleSearchSelect}
            disabled={processing}
            loading={rosterLoading}
          />
        </div>

        {/*
          Test / Live switch — above the camera selector. Test routes scans
          through a sandbox session so nothing hits real attendance.
        */}
        <div className="flex items-center justify-between gap-2">
          <Tabs
            value={mode}
            onValueChange={(v) => handleModeChange(v as "live" | "test")}
          >
            <TabsList className="h-8">
              <TabsTrigger value="live" className="gap-1 text-xs px-2.5">
                <Radio className="h-3.5 w-3.5" />
                Live
              </TabsTrigger>
              <TabsTrigger value="test" className="gap-1 text-xs px-2.5">
                <Beaker className="h-3.5 w-3.5" />
                Test
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {mode === "test" && (
            <Badge
              variant="outline"
              className="gap-1 text-xs border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-300"
            >
              <Beaker className="h-3 w-3" />
              {switchingMode ? "Starting…" : "Sandbox — not recorded"}
            </Badge>
          )}
        </div>

        {/* Camera selector — moved out of the scanner viewport to here. */}
        {cameraSelect && (
          <CameraSelect
            devices={cameraSelect.devices}
            value={cameraSelect.selectedDeviceId}
            onChange={cameraSelect.setSelectedDeviceId}
            onRefresh={cameraSelect.refresh}
          />
        )}

        {statusBar}
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
  );
}
