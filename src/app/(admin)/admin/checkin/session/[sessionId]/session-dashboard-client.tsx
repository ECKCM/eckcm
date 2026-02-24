"use client";

import { useState, useRef, useCallback } from "react";
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
  ScanLine,
  Users,
  Calendar,
  Clock,
  Pause,
  Play,
  Loader2,
} from "lucide-react";
import { addCheckinLog, getRecentLogs } from "@/lib/checkin/offline-store";
import { useEffect } from "react";

interface Session {
  id: string;
  event_id: string;
  name_en: string;
  name_ko: string | null;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  is_active: boolean;
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

export function SessionDashboardClient({
  session,
  initialCheckinCount,
}: {
  session: Session;
  initialCheckinCount: number;
}) {
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [checkinCount, setCheckinCount] = useState(initialCheckinCount);
  const [recentCheckins, setRecentCheckins] = useState<ScanResult[]>([]);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScannedRef = useRef<string | null>(null);

  useEffect(() => {
    getRecentLogs(20).then((logs) => {
      setRecentCheckins(
        logs
          .filter((l) => l.checkinType === "SESSION")
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
    };
  }, []);

  const handleScan = useCallback(
    async (detectedCodes: { rawValue: string }[]) => {
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

      try {
        const res = await fetch("/api/checkin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            checkinType: "SESSION",
            sessionId: session.id,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          result = {
            status: data.status,
            person: data.person,
            confirmationCode: data.confirmationCode,
            checkinType: "SESSION",
            timestamp: new Date(),
            isOffline: false,
          };
          if (data.status === "checked_in") {
            setCheckinCount((prev) => prev + 1);
          }
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
        result = {
          status: "error",
          errorMessage: "Network error",
          timestamp: new Date(),
          isOffline: true,
        };
      }

      playBeep(result.status !== "error");
      setScanResult(result);
      setRecentCheckins((prev) => [result, ...prev].slice(0, 20));

      await addCheckinLog({
        personName: result.person?.name ?? "Unknown",
        koreanName: result.person?.koreanName ?? null,
        confirmationCode: result.confirmationCode ?? null,
        status: result.status,
        checkinType: "SESSION",
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
    },
    [processing, session.id]
  );

  return (
    <div className="space-y-4">
      {/* Session Info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-medium">{session.session_date}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Time</p>
              <p className="font-medium">
                {session.start_time && session.end_time
                  ? `${session.start_time} - ${session.end_time}`
                  : "Not set"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Checked In</p>
              <p className="font-medium text-lg">{checkinCount}</p>
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
                  QR Scanner
                </CardTitle>
                <Badge variant={session.is_active ? "default" : "secondary"}>
                  {session.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="aspect-square max-w-[400px] mx-auto relative rounded-lg overflow-hidden border">
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
                      <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
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
                    onClick={() => setScanning(false)}
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
            <CardTitle className="text-base">Recent Session Check-ins</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentCheckins checkins={recentCheckins} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
