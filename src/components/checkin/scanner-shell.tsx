"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Pause,
  Play,
  Loader2,
  Camera,
  Keyboard,
  Antenna,
  Flashlight,
  FlashlightOff,
} from "lucide-react";
import { CameraErrorFallback } from "@/components/checkin/camera-error-fallback";
import { ManualIdInput } from "@/components/checkin/manual-id-input";
import { CameraSelect } from "@/components/checkin/camera-select";
import { InvalidQrOverlay } from "@/components/checkin/invalid-qr-overlay";
import { useCameraPermission } from "@/lib/checkin/use-camera-permission";
import {
  useCameraDevices,
  type CameraDevice,
  type CameraFacing,
} from "@/lib/checkin/use-camera-devices";
import { useHidScanner } from "@/lib/checkin/use-hid-scanner";
import { parseQRValue, type ParsedQR } from "@/lib/checkin/qr-parser";

type InputMode = "camera" | "hardware";

/** Device state needed to render <CameraSelect> outside the scanner viewport. */
export interface CameraSelectController {
  devices: CameraDevice[];
  selectedDeviceId: string | null;
  setSelectedDeviceId: (deviceId: string) => void;
  refresh: () => void;
}

interface ScannerShellProps {
  /** Called when a recognized QR or manual code is parsed. */
  onScan: (parsed: ParsedQR) => void;
  /**
   * Whether the camera should be live. The parent controls this so it can
   * pause while a verify request is in flight or after a successful scan.
   * Ignored in hardware mode (which is always live while enabled).
   */
  scanning: boolean;
  onScanningChange: (next: boolean) => void;
  /** True while a verify request is in flight — replaces the viewport with a spinner. */
  processing?: boolean;
  /** Optional "Resuming in Ns" indicator. */
  resumeCountdown?: number | null;
  /** Disable scanning entirely (e.g., scan session ended). */
  disabled?: boolean;
  disabledReason?: string;
  /** Default camera facing when no preference is stored. */
  defaultCameraFacing?: CameraFacing;
  /** Default input mode when no preference is stored. */
  defaultInputMode?: InputMode;
  /** Show the manual Participant ID input below the viewport. */
  showManualInput?: boolean;
  /** Show the camera selector (only relevant in camera mode). */
  showCameraSelect?: boolean;
  /**
   * When provided, ScannerShell does NOT render the camera selector below the
   * viewport. Instead it reports whether a selector should show plus the
   * device controller, so the parent can render <CameraSelect> wherever it
   * wants (e.g. lower in a phone layout). `controller` is null when the
   * selector shouldn't show (hardware mode / permission not granted).
   */
  onCameraSelectChange?: (controller: CameraSelectController | null) => void;
  /** Show the Camera / Hardware mode toggle. */
  showInputModeToggle?: boolean;
  /** Used to namespace localStorage keys per surface (e.g. "kiosk"). */
  cameraStorageNamespace?: string;
  className?: string;
}

const INPUT_MODE_STORAGE_PREFIX = "checkin.inputMode";

/**
 * Reusable scanner viewport used by every check-in sub-page.
 *
 *  - Camera mode: standard QR scanning via @yudiel/react-qr-scanner.
 *  - Hardware mode: listens for HID keystrokes from USB/Bluetooth QR scanners
 *    (via useHidScanner). The camera is off — saves battery and avoids
 *    permission prompts on shared kiosks.
 *  - Manual fallback (Participant ID input) works in both modes.
 *  - Invalid QR triggers a full-screen red flash.
 *
 *  The parent owns the scan lifecycle (verify call, recent list, audio
 *  feedback). This component is the viewport + input surface.
 */
export function ScannerShell({
  onScan,
  scanning,
  onScanningChange,
  processing = false,
  resumeCountdown = null,
  disabled = false,
  disabledReason,
  defaultCameraFacing = "environment",
  defaultInputMode = "camera",
  showManualInput = true,
  showCameraSelect = true,
  showInputModeToggle = true,
  onCameraSelectChange,
  cameraStorageNamespace = "default",
  className,
}: ScannerShellProps) {
  const camera = useCameraPermission();
  const devices = useCameraDevices({
    defaultFacing: defaultCameraFacing,
    storageKey: `checkin.${cameraStorageNamespace}.cameraDeviceId`,
    enabled: camera.status === "granted",
  });

  const inputModeStorageKey = `${INPUT_MODE_STORAGE_PREFIX}.${cameraStorageNamespace}`;
  const [inputMode, setInputModeState] = useState<InputMode>(defaultInputMode);
  const [hidBuffer, setHidBuffer] = useState<{ buf: string; fast: boolean }>({
    buf: "",
    fast: false,
  });
  const [invalidFlashId, setInvalidFlashId] = useState<number | null>(null);
  const [lastInvalidRaw, setLastInvalidRaw] = useState<string | null>(null);
  const lastScannedRef = useRef<string | null>(null);

  // Torch/flash: implemented directly (the library's built-in torch button is
  // disabled below) so we control its position — bottom-LEFT, opposite the
  // bottom-right Pause button. We reach the live MediaStreamTrack through the
  // <video> the Scanner renders inside the viewport.
  const viewportRef = useRef<HTMLDivElement>(null);
  const [torchOn, setTorchOn] = useState(false);

  const getVideoTrack = useCallback((): MediaStreamTrack | null => {
    const video = viewportRef.current?.querySelector("video");
    const stream = (video?.srcObject ?? null) as MediaStream | null;
    return stream?.getVideoTracks?.()[0] ?? null;
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = getVideoTrack();
    if (!track) return;
    const next = !torchOn;
    try {
      // `torch` isn't in the standard MediaTrackConstraintSet type yet, but is
      // supported on Android Chrome. Cast through unknown.
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      // Device/browser doesn't support torch (e.g. iOS Safari) — no-op.
    }
  }, [getVideoTrack, torchOn]);

  // Torch turns off with the camera; reset our state so the icon matches.
  useEffect(() => {
    if (!scanning) setTorchOn(false);
  }, [scanning]);

  // Restore input mode preference per surface.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(inputModeStorageKey);
    if (stored === "camera" || stored === "hardware") {
      setInputModeState(stored);
    }
  }, [inputModeStorageKey]);

  const setInputMode = useCallback(
    (next: InputMode) => {
      setInputModeState(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(inputModeStorageKey, next);
      }
    },
    [inputModeStorageKey]
  );

  // Reset dedupe key whenever the parent pauses + resumes the scanner.
  useEffect(() => {
    if (scanning) lastScannedRef.current = null;
  }, [scanning]);

  const flashInvalid = useCallback(() => {
    setInvalidFlashId(Date.now());
  }, []);

  const handleRawValue = useCallback(
    (rawValue: string) => {
      if (disabled || processing) return;
      // In camera mode, respect the scanning flag; in hardware mode the
      // hook only fires when ready anyway.
      if (inputMode === "camera" && !scanning) return;

      const parsed = parseQRValue(rawValue);
      if (!parsed) {
        setLastInvalidRaw(rawValue);
        console.warn("[scanner-shell] unparseable scan", {
          length: rawValue.length,
          raw: rawValue,
          json: JSON.stringify(rawValue),
        });
        flashInvalid();
        return;
      }
      const dedupeKey =
        parsed.kind === "participantCode" ? parsed.participantCode : parsed.token;
      if (lastScannedRef.current === dedupeKey) return;
      lastScannedRef.current = dedupeKey;
      onScan(parsed);
    },
    [disabled, processing, scanning, inputMode, onScan, flashInvalid]
  );

  const handleScan = useCallback(
    (detectedCodes: { rawValue: string }[]) => {
      if (!detectedCodes.length) return;
      handleRawValue(detectedCodes[0].rawValue);
    },
    [handleRawValue]
  );

  const handleManualSubmit = useCallback(
    (code: string) => {
      if (disabled || processing) return;
      handleRawValue(code);
    },
    [disabled, processing, handleRawValue]
  );

  // Hardware scanner — listens while enabled, regardless of camera state.
  useHidScanner({
    enabled: inputMode === "hardware" && !disabled && !processing,
    onScan: handleRawValue,
    onBuffer: (buf, fast) => setHidBuffer({ buf, fast }),
  });

  const constraints = devices.selectedDeviceId
    ? { deviceId: { exact: devices.selectedDeviceId } }
    : { facingMode: { ideal: defaultCameraFacing } };

  // Whether the camera selector should be visible at all.
  const cameraSelectVisible =
    showCameraSelect && inputMode === "camera" && camera.status === "granted";

  // When the parent wants to place the selector itself, hand it the device
  // controller (or null when it shouldn't show). Kept in an effect so we never
  // setState-in-render in the parent.
  const { devices: deviceList, selectedDeviceId, setSelectedDeviceId } = devices;
  const refreshDevices = devices.refresh;
  useEffect(() => {
    if (!onCameraSelectChange) return;
    onCameraSelectChange(
      cameraSelectVisible
        ? {
            devices: deviceList,
            selectedDeviceId,
            setSelectedDeviceId,
            refresh: refreshDevices,
          }
        : null
    );
  }, [
    onCameraSelectChange,
    cameraSelectVisible,
    deviceList,
    selectedDeviceId,
    setSelectedDeviceId,
    refreshDevices,
  ]);

  // Wake lock while the scanner is live (either mode).
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    const wantsLock = !disabled && (inputMode === "hardware" || scanning);
    if (!wantsLock) return;
    let cancelled = false;
    async function acquire() {
      if (!("wakeLock" in navigator)) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
        } else {
          wakeLockRef.current = lock;
        }
      } catch {
        // Best-effort.
      }
    }
    acquire();
    return () => {
      cancelled = true;
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [scanning, disabled, inputMode]);

  const togglePause = () => onScanningChange(!scanning);

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {showInputModeToggle && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Tabs
            value={inputMode}
            onValueChange={(v) => setInputMode(v as InputMode)}
          >
            <TabsList>
              <TabsTrigger value="camera" className="gap-1.5">
                <Camera className="h-4 w-4" />
                Camera
              </TabsTrigger>
              <TabsTrigger value="hardware" className="gap-1.5">
                <Keyboard className="h-4 w-4" />
                QR Scanner
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {inputMode === "hardware" && !disabled && (
            <Badge
              variant="outline"
              className={`gap-1 ${
                hidBuffer.fast
                  ? "border-green-400 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300"
                  : ""
              }`}
            >
              <Antenna className="h-3 w-3" />
              {hidBuffer.fast ? `Reading ${hidBuffer.buf.length}…` : "Waiting"}
            </Badge>
          )}
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-hidden relative">
          <div
            ref={viewportRef}
            className="aspect-square max-w-[400px] mx-auto relative"
          >
            {disabled ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-muted/50 px-6 text-center gap-2">
                <Pause className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {disabledReason || "Scanning is paused"}
                </p>
              </div>
            ) : inputMode === "hardware" ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 gap-3 px-6 text-center">
                {processing ? (
                  <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <Keyboard className="h-14 w-14 text-slate-400" />
                    <p className="text-base font-medium">QR Scanner Ready</p>
                    <p className="text-xs text-muted-foreground">
                      Point your USB / Bluetooth scanner at a code.
                    </p>
                    {hidBuffer.buf && (
                      <p className="font-mono text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        {hidBuffer.buf.slice(-32)}
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : camera.status !== "granted" ? (
              <div className="w-full h-full flex items-center justify-center bg-muted/30">
                <CameraErrorFallback
                  status={camera.status}
                  onAllow={camera.allow}
                />
              </div>
            ) : scanning && !processing ? (
              <Scanner
                key={devices.selectedDeviceId ?? defaultCameraFacing}
                constraints={constraints}
                onScan={handleScan}
                onError={(err) => {
                  const name = err instanceof Error ? err.name : "";
                  if (name === "NotAllowedError") {
                    camera.deny();
                  } else if (
                    name === "AbortError" ||
                    name === "OverconstrainedError"
                  ) {
                    // Transient: fired when the stream restarts (e.g. switching
                    // cameras remounts <Scanner> and aborts the old stream).
                    // Not a real failure — keep scanning so the camera doesn't
                    // die every time the device changes.
                  } else {
                    onScanningChange(false);
                  }
                }}
                allowMultiple={false}
                scanDelay={500}
                // torch disabled — we render our own flash button (bottom-left)
                // so we control its position vs the Pause button.
                components={{ finder: true, torch: false }}
                styles={{
                  container: { width: "100%", height: "100%" },
                  video: { objectFit: "cover" as const },
                }}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-muted/30 gap-3">
                {processing ? (
                  <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <Pause className="h-10 w-10 text-muted-foreground" />
                    {resumeCountdown !== null ? (
                      <p className="text-sm text-muted-foreground">
                        Resuming in {resumeCountdown}s
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Paused</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Flash (torch) — bottom-LEFT. Only while the camera is live. */}
          {!disabled &&
            !processing &&
            scanning &&
            inputMode === "camera" &&
            camera.status === "granted" && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="absolute bottom-3 left-3 gap-1"
                onClick={toggleTorch}
                aria-label={torchOn ? "Turn flash off" : "Turn flash on"}
              >
                {torchOn ? (
                  <FlashlightOff className="h-4 w-4" />
                ) : (
                  <Flashlight className="h-4 w-4" />
                )}
              </Button>
            )}

          {/* Pause/resume — bottom-RIGHT, opposite the flash button. */}
          {!disabled &&
            !processing &&
            inputMode === "camera" &&
            camera.status === "granted" && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="absolute bottom-3 right-3 gap-1"
                onClick={togglePause}
              >
                {scanning ? (
                  <>
                    <Pause className="h-4 w-4" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" /> Resume
                  </>
                )}
              </Button>
            )}
        </CardContent>
      </Card>

      {/* When onCameraSelectChange is provided, the parent renders the selector
          itself (e.g. lower in a phone layout) — so we don't place it inline. */}
      {!onCameraSelectChange && cameraSelectVisible && (
        <CameraSelect
          devices={devices.devices}
          value={devices.selectedDeviceId}
          onChange={devices.setSelectedDeviceId}
          onRefresh={devices.refresh}
        />
      )}

      {showManualInput && (
        <ManualIdInput
          disabled={disabled || processing}
          onSubmit={handleManualSubmit}
        />
      )}

      <InvalidQrOverlay trigger={invalidFlashId} rawValue={lastInvalidRaw} />
    </div>
  );
}
