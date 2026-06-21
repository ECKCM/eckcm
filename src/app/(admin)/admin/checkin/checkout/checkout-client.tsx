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
import { Beaker, Radio, LogOut } from "lucide-react";
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
import { addCheckinLog, getRecentLogs } from "@/lib/checkin/offline-store";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

interface CheckoutClientProps {
  events: EventOption[];
}

const RESUME_DELAY_MS = 3000;

export function CheckoutClient({ events }: CheckoutClientProps) {
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [recentCheckins, setRecentCheckins] = useState<ScanResult[]>([]);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const [mode, setMode] = useState<"live" | "test">("live");
  const [switchingMode, setSwitchingMode] = useState(false);
  // Camera selector is hoisted out of the scanner so it can sit below search.
  const [cameraSelect, setCameraSelect] =
    useState<CameraSelectController | null>(null);
  // Searchable roster for manual check-out by name / phone / email / reg code.
  const [roster, setRoster] = useState<SearchableParticipant[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Test mode routes scans through a sandbox scan session (is_sandbox=true) so
  // nothing lands in real attendance. Live mode submits with no session.
  const sandbox = useScanSession({
    storageKey: "checkin.scanSessionId.checkout-sandbox",
  });

  // Offline cache: auto-loads when event changes and is used for instant scan
  // preview (the person's name) while the server checkout call completes.
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
          .filter((l) => l.checkinType === "CHECKOUT")
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

  // Load the searchable roster once per event for manual check-out search.
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
    // Resume the camera but keep the last result on screen until the NEXT scan
    // replaces it — the operator never loses the person they just processed.
    resumeTimerRef.current = setTimeout(() => {
      setScanning(true);
    }, RESUME_DELAY_MS);
  }, []);

  const handleScan = useCallback(
    async (parsed: ParsedQR) => {
      setProcessing(true);
      setScanning(false);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);

      // 1. Cache-first preview — renders the name instantly while the server
      //    checkout call completes. Status stays pending until the server lands.
      const cached = await cache.lookup(parsed);
      if (cached) {
        setScanResult({
          status: "checked_out",
          person: {
            name: cached.personName,
            koreanName: cached.koreanName,
            participantCode: cached.participantCode,
          },
          confirmationCode: cached.confirmationCode,
          checkinType: "CHECKOUT",
          timestamp: new Date(),
          isPending: true,
        });
      }

      let result: ScanResult;

      // Test mode goes through the sandbox scan session so nothing hits real
      // attendance. Check-out has no offline pending queue (it must reconcile
      // against an existing check-in), so it's online-only.
      const testMode = mode === "test" && !!sandbox.session;

      if (!isOnline) {
        result = {
          status: "error",
          person: cached
            ? { name: cached.personName, koreanName: cached.koreanName }
            : undefined,
          errorMessage: "Check-out needs a connection",
          checkinType: "CHECKOUT",
          timestamp: new Date(),
          isOffline: true,
        };
      } else if (testMode) {
        try {
          const res = await fetch("/api/checkin/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...toVerifyBody(parsed),
              scanSessionId: sandbox.session!.id,
            }),
          });
          const data = await res.json();
          result = res.ok
            ? {
                status: data.status,
                person: data.person,
                confirmationCode: data.confirmationCode,
                checkinType: "CHECKOUT",
                checkedInAt: data.checkedInAt,
                checkedOutAt: data.checkedOutAt,
                isSandbox: data.isSandbox,
                timestamp: new Date(),
                isOffline: false,
              }
            : {
                status: "error",
                person: data.person,
                errorMessage: data.error || "Check-out failed",
                checkinType: "CHECKOUT",
                isSandbox: true,
                timestamp: new Date(),
              };
        } catch {
          result = {
            status: "error",
            errorMessage: "Test mode needs a connection",
            checkinType: "CHECKOUT",
            isSandbox: true,
            timestamp: new Date(),
          };
        }
      } else {
        try {
          const res = await fetch("/api/checkin/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(toVerifyBody(parsed)),
          });
          const data = await res.json();
          result = res.ok
            ? {
                status: data.status,
                person: data.person,
                confirmationCode: data.confirmationCode,
                checkinType: "CHECKOUT",
                checkedInAt: data.checkedInAt,
                checkedOutAt: data.checkedOutAt,
                timestamp: new Date(),
                isOffline: false,
              }
            : {
                status: "error",
                person: data.person,
                errorMessage: data.error || "Check-out failed",
                checkinType: "CHECKOUT",
                timestamp: new Date(),
              };
        } catch {
          result = {
            status: "error",
            person: cached
              ? { name: cached.personName, koreanName: cached.koreanName }
              : undefined,
            errorMessage: "Network error",
            checkinType: "CHECKOUT",
            timestamp: new Date(),
            isOffline: true,
          };
        }
      }

      const tone =
        result.status === "checked_out"
          ? "success"
          : result.status === "error"
            ? "error"
            : "warn";
      feedback(tone);

      setScanResult(result);
      setRecentCheckins((prev) => [result, ...prev].slice(0, 30));

      await addCheckinLog({
        personName: result.person?.name ?? "Unknown",
        koreanName: result.person?.koreanName ?? null,
        confirmationCode: result.confirmationCode ?? null,
        status: result.status,
        checkinType: "CHECKOUT",
        timestamp: result.timestamp.toISOString(),
        isOffline: result.isOffline ?? false,
        errorMessage: result.errorMessage,
      });

      setProcessing(false);
      startResumeCountdown();
    },
    [isOnline, cache, startResumeCountdown, mode, sandbox.session]
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
              label: "Check-out · test",
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

  // Manual check-out via the search dropdown — selecting a participant runs the
  // exact same check-out flow as a camera scan. The code comes from the roster,
  // so it's already a valid participant code.
  const handleSearchSelect = useCallback(
    (participantCode: string) => {
      if (processing) return;
      handleScan({ kind: "participantCode", participantCode });
    },
    [processing, handleScan]
  );

  const statusBar = (
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

      <Badge variant="outline" className="h-8 gap-1.5 px-2.5 text-xs">
        <LogOut className="h-3.5 w-3.5" />
        Check-out
      </Badge>

      <CacheStatusBar
        status={cache.status}
        count={cache.count}
        onResync={cache.refresh}
        collapsible
        className="flex-1"
      />
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/*
        Phone-first: the camera sits at the very top, then the scan result,
        then manual search, then the Test/Live switch, camera selector, and
        status row — all stacked so everything fits one screen. On desktop it
        splits into a two-column station layout. Mirrors Main Check-in.
      */}
      <div className="space-y-3">
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
            cameraStorageNamespace="checkout"
            showInputModeToggle={false}
            showManualInput={false}
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
          <CardTitle className="text-base">Recent Check-outs</CardTitle>
        </CardHeader>
        <CardContent>
          <RecentCheckins checkins={recentCheckins} />
        </CardContent>
      </Card>
    </div>
  );
}
