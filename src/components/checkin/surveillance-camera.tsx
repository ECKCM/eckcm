"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { VideoOff } from "lucide-react";

interface SurveillanceCameraProps {
  /** When true the camera stream runs; false stops and releases it. */
  active: boolean;
  /** Which camera to show. Defaults to the front (selfie) camera. */
  facingMode?: "user" | "environment";
  className?: string;
  /**
   * What to render when the camera can't be opened (no camera, denied, or
   * in use). The surveillance feed is a non-essential deterrent, so callers
   * (e.g. the hardware-scanner kiosk) pass a calm "ready to scan" panel here
   * instead of the alarming default "Camera unavailable" frame.
   */
  fallback?: ReactNode;
}

function clockLabel(): string {
  // Eastern Time basis — the gathering is on the US East Coast.
  const now = new Date();
  return now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * A deliberately decoy "CCTV" feed. It shows the front camera live but never
 * decodes anything — it exists purely as a visible deterrent on the kiosk
 * ("you are being recorded"). Real scanning on that surface comes from the
 * USB / Bluetooth hardware scanner, never from this camera.
 *
 * Because no decoder is mounted, a QR held up to this camera does nothing —
 * which is exactly the hardware-mode requirement.
 */
export function SurveillanceCamera({
  active,
  facingMode = "user",
  className,
  fallback,
}: SurveillanceCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState(false);
  const [stamp, setStamp] = useState<string>("");

  // Live timestamp tick (only while visible).
  useEffect(() => {
    if (!active) return;
    setStamp(clockLabel());
    const t = setInterval(() => setStamp(clockLabel()), 1000);
    return () => clearInterval(t);
  }, [active]);

  // Acquire / release the camera stream.
  useEffect(() => {
    let cancelled = false;

    function stop() {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    }

    if (!active) {
      stop();
      return;
    }

    /**
     * On phones / tablets that expose more than one camera per facing (recent
     * iPhones, Galaxy/Pixel models), the OS-level default for facingMode is
     * the narrow "Front" camera. The wide / ultra-wide version covers a much
     * larger surveillance area, which is what we actually want for a "you're
     * being watched" CCTV view. Pick it by label when available, fall back to
     * plain facingMode otherwise (older devices, desktops, denied perms).
     *
     * Labels are only populated AFTER getUserMedia returns once, so we do the
     * lookup post-permission. The label heuristics are intentionally loose:
     * different OSes / browsers emit "Wide", "Ultra Wide", "0.5x", "wide
     * angle", etc.
     */
    function pickWideDeviceId(devices: MediaDeviceInfo[]): string | null {
      const wantFront = facingMode === "user";
      const wideRe = /\b(wide|ultra\s*wide|0\.5x?)\b/i;
      const frontRe = /\b(front|user|selfie|facetime)\b/i;
      const backRe = /\b(back|rear|environment)\b/i;
      const inputs = devices.filter((d) => d.kind === "videoinput");
      const score = (d: MediaDeviceInfo) => {
        let s = 0;
        if (wideRe.test(d.label)) s += 10;
        if (wantFront && frontRe.test(d.label)) s += 5;
        if (!wantFront && backRe.test(d.label)) s += 5;
        if (wantFront && backRe.test(d.label)) s -= 100; // wrong facing
        if (!wantFront && frontRe.test(d.label)) s -= 100;
        return s;
      };
      const ranked = inputs
        .filter((d) => d.label) // unlabeled = pre-permission, skip
        .map((d) => ({ d, s: score(d) }))
        .filter((x) => x.s >= 10) // require a wide hint
        .sort((a, b) => b.s - a.s);
      return ranked[0]?.d.deviceId ?? null;
    }

    (async () => {
      try {
        // Step 1: get any front camera so the browser surfaces labels.
        const initial = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false,
        });
        if (cancelled) {
          initial.getTracks().forEach((track) => track.stop());
          return;
        }

        // Step 2: best-effort wide-camera swap. Only stop the initial
        // stream AFTER the wide getUserMedia succeeds — otherwise an
        // OverconstrainedError on `deviceId: exact` would leave us with
        // no stream at all (black "Camera unavailable" frame).
        let finalStream = initial;
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const wideId = pickWideDeviceId(devices);
          if (wideId) {
            const wideStream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: wideId } },
              audio: false,
            });
            if (cancelled) {
              wideStream.getTracks().forEach((t) => t.stop());
              initial.getTracks().forEach((t) => t.stop());
              return;
            }
            // wide stream is live → drop the initial and switch.
            initial.getTracks().forEach((t) => t.stop());
            finalStream = wideStream;
          }
        } catch {
          /* enumerate / wide-swap failed — keep the initial stream alive */
        }

        streamRef.current = finalStream;
        if (videoRef.current) {
          videoRef.current.srcObject = finalStream;
          videoRef.current.play().catch(() => {
            /* autoplay races are harmless here */
          });
        }
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [active, facingMode]);

  // Camera failed and the caller gave us a fallback — render that instead of
  // the alarming default frame (the surveillance feed is non-essential).
  if (error && fallback !== undefined) {
    return <>{fallback}</>;
  }

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-black ${className ?? ""}`}
    >
      {error ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-900 text-slate-500">
          <VideoOff className="h-16 w-16" />
          <p className="text-sm">Camera unavailable</p>
          <p className="px-6 text-center text-xs text-slate-600">
            Surveillance preview only — scanning still works through the
            hardware scanner.
          </p>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          // scaleX(-1): mirror like a selfie cam so the operator can
          //   self-position naturally (right-on-screen = their right).
          // brightness(1.15): venue lighting is usually dim, this lifts
          //   the feed without blowing out faces.
          className="h-full w-full object-cover [transform:scaleX(-1)] [filter:brightness(1.15)_contrast(1.05)_saturate(0.9)]"
        />
      )}

      {/* Surveillance chrome — corner brackets */}
      <div className="pointer-events-none absolute inset-3">
        <span className="absolute left-0 top-0 h-7 w-7 border-l-2 border-t-2 border-white/50" />
        <span className="absolute right-0 top-0 h-7 w-7 border-r-2 border-t-2 border-white/50" />
        <span className="absolute bottom-0 left-0 h-7 w-7 border-b-2 border-l-2 border-white/50" />
        <span className="absolute bottom-0 right-0 h-7 w-7 border-b-2 border-r-2 border-white/50" />
      </div>

      {/* Faint scanlines for that CCTV-monitor look */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background:repeating-linear-gradient(0deg,transparent,transparent_2px,#000_3px)]" />

      {/* REC indicator */}
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded bg-black/40 px-2 py-1 backdrop-blur-sm">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.7)]" />
        <span className="font-mono text-xs font-semibold tracking-widest text-white/90">
          REC
        </span>
      </div>

      {/* Camera label */}
      <div className="pointer-events-none absolute right-4 top-4 rounded bg-black/40 px-2 py-1 font-mono text-xs tracking-widest text-white/80 backdrop-blur-sm">
        CAM&nbsp;01 · LIVE
      </div>

      {/* Timestamp */}
      <div className="pointer-events-none absolute bottom-4 left-4 rounded bg-black/40 px-2 py-1 font-mono text-xs text-white/80 backdrop-blur-sm">
        {stamp}
      </div>
    </div>
  );
}
