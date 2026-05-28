"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ScanLine,
  ListChecks,
  QrCode,
  Beaker,
  Search,
  Play,
} from "lucide-react";
import {
  ScanResultCard,
  type ScanResult,
} from "@/components/checkin/scan-result-card";
import { ScannerShell } from "@/components/checkin/scanner-shell";
import { ScanSessionControls } from "@/components/checkin/scan-session-controls";
import { CacheStatusBar } from "@/components/checkin/cache-status-bar";
import { feedback } from "@/lib/checkin/scanner-feedback";
import { toVerifyBody, type ParsedQR } from "@/lib/checkin/qr-parser";
import { useScanSession } from "@/lib/checkin/use-scan-session";
import { useEpassCache } from "@/lib/checkin/use-epass-cache";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

export interface TestParticipant {
  personId: string;
  participantCode: string;
  name: string;
  koreanName: string | null;
  gender: string | null;
  birthDate: string | null;
  confirmationCode: string;
  registrationStatus: string;
}

interface TestCheckinClientProps {
  events: EventOption[];
  initialEventId: string;
  initialParticipants: TestParticipant[];
}

export function TestCheckinClient({
  events,
  initialEventId,
  initialParticipants,
}: TestCheckinClientProps) {
  const [selectedEventId, setSelectedEventId] = useState(initialEventId);
  const [search, setSearch] = useState("");
  const [participants] = useState<TestParticipant[]>(initialParticipants);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [scannerLive, setScannerLive] = useState(true);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sandbox = useScanSession({
    storageKey: "checkin.scanSessionId.sandbox",
  });
  const cache = useEpassCache({ eventId: selectedEventId || null });

  // Detach stale sandbox sessions that belong to a different event.
  if (
    sandbox.session &&
    sandbox.session.event_id !== selectedEventId &&
    selectedEventId
  ) {
    // Only detach (no API call) — they can pick up again from the start button.
    sandbox.detach();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return participants.slice(0, 100);
    return participants
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.koreanName ?? "").toLowerCase().includes(q) ||
          p.participantCode.toLowerCase().includes(q) ||
          p.confirmationCode.toLowerCase().includes(q)
      )
      .slice(0, 100);
  }, [participants, search]);

  const startSandbox = useCallback(async () => {
    if (!selectedEventId) return;
    await sandbox.start({
      eventId: selectedEventId,
      kind: "OTHER",
      label: "Sandbox · test",
      isSandbox: true,
    });
    setScannerLive(true);
  }, [sandbox, selectedEventId]);

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

  const submitSandboxScan = useCallback(
    async (parsed: ParsedQR) => {
      if (!sandbox.canScan || !sandbox.session) return;
      setProcessing(true);
      setScannerLive(false);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);

      let result: ScanResult;
      try {
        const res = await fetch("/api/checkin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...toVerifyBody(parsed),
            checkinType: "MAIN",
            scanSessionId: sandbox.session.id,
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
            totalCount: data.totalCount,
            timestamp: new Date(),
            isOffline: false,
          };
          feedback("success");
        } else {
          result = {
            status: "error",
            person: data.person,
            registration: data.registration,
            errorMessage: data.error || "Sandbox scan failed",
            timestamp: new Date(),
          };
          feedback("error");
        }
      } catch {
        result = {
          status: "error",
          errorMessage: "Network error",
          timestamp: new Date(),
        };
        feedback("error");
      }
      setScanResult(result);
      setProcessing(false);
      startResumeCountdown();
    },
    [sandbox.canScan, sandbox.session, startResumeCountdown]
  );

  // "Test scan" button on a participant row — mimics a real scan.
  const simulateScan = useCallback(
    (participantCode: string) => {
      submitSandboxScan({ kind: "participantCode", participantCode });
    },
    [submitSandboxScan]
  );

  const sessionActive = sandbox.canScan;
  const disabledReason = !sandbox.session
    ? "Start the sandbox session to enable testing"
    : sandbox.status === "PAUSED"
      ? "Sandbox paused"
      : sandbox.status === "ENDED"
        ? "Sandbox ended"
        : undefined;

  return (
    <div className="space-y-4">
      <Card className="border-purple-300 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-800">
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <Beaker className="h-5 w-5 text-purple-600 shrink-0" />
          <p className="text-sm">
            Sandbox mode. No real check-ins are recorded — every scan returns a
            simulated success so you can rehearse the flow without polluting
            attendance data.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
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
        <CacheStatusBar
          status={cache.status}
          count={cache.count}
          onResync={cache.refresh}
        />
      </div>

      <ScanSessionControls
        session={sandbox.session}
        loading={sandbox.loading}
        startLabel="Start sandbox session"
        startDisabled={!selectedEventId}
        onStart={startSandbox}
        onPause={sandbox.pause}
        onResume={sandbox.resume}
        onEnd={sandbox.end}
      />

      <Tabs defaultValue="participants">
        <TabsList>
          <TabsTrigger value="participants" className="gap-1.5">
            <ListChecks className="h-4 w-4" />
            QR Codes
          </TabsTrigger>
          <TabsTrigger value="scanner" className="gap-1.5">
            <ScanLine className="h-4 w-4" />
            Live Scanner
          </TabsTrigger>
        </TabsList>

        <TabsContent value="participants" className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, participant ID, or reg ID..."
              className="pl-8"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full text-center py-8">
                No participants found.
              </p>
            )}
            {filtered.map((p) => (
              <Card key={p.personId} className="flex flex-row">
                <CardContent className="p-3 flex-1 min-w-0 space-y-1">
                  <p className="font-semibold truncate">{p.name}</p>
                  {p.koreanName && (
                    <p className="text-sm text-muted-foreground truncate">
                      {p.koreanName}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Badge variant="outline" className="font-mono text-xs">
                      {p.participantCode}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs">
                      {p.confirmationCode}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {p.registrationStatus}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => simulateScan(p.participantCode)}
                    disabled={!sessionActive || processing}
                    className="gap-1.5 mt-2 w-full"
                  >
                    <Play className="h-4 w-4" />
                    Test scan
                  </Button>
                </CardContent>
                <div className="p-3 bg-card border-l flex items-center justify-center shrink-0">
                  <QRCodeSVG
                    value={p.participantCode}
                    size={84}
                    includeMargin={false}
                    aria-label={`QR for ${p.name}`}
                  />
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="scanner" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <QrCode className="h-4 w-4" />
                    Sandbox Scanner
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScannerShell
                    onScan={submitSandboxScan}
                    scanning={scannerLive && sessionActive}
                    onScanningChange={setScannerLive}
                    processing={processing}
                    resumeCountdown={resumeCountdown}
                    disabled={!sessionActive}
                    disabledReason={disabledReason}
                    defaultCameraFacing="environment"
                    cameraStorageNamespace="sandbox"
                  />
                </CardContent>
              </Card>
              <ScanResultCard result={scanResult} />
            </div>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Hint</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  Switch to the <strong>QR Codes</strong> tab to pick a specific
                  participant and simulate a scan with one click — useful when
                  you don't have printed QR codes nearby.
                </p>
                <p>
                  The manual input below the scanner accepts a 6-character
                  Participant ID, so you can type any code straight in to
                  rehearse error paths (typos, invalid IDs).
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
