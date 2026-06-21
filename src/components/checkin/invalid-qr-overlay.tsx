"use client";

import { useEffect, useState } from "react";
import { AlertOctagon } from "lucide-react";

interface InvalidQrOverlayProps {
  /** When this changes to a truthy value, the overlay flashes. */
  trigger: number | null;
  message?: string;
  /** Auto-hide duration in ms. Defaults to 1500. */
  durationMs?: number;
  /**
   * The exact raw text the scanner produced for the rejected scan. Surfaced
   * so the operator can see *why* it was rejected (HID mangling, wrong code,
   * stray characters, etc.) instead of staring at a generic red flash.
   */
  rawValue?: string | null;
}

/** Make every byte visible — spaces become "·", control bytes become hex. */
function visualizeRaw(value: string): string {
  return value
    .replace(/\r/g, "␍")
    .replace(/\n/g, "␊")
    .replace(/\t/g, "␉")
    .replace(/ /g, "·");
}

/**
 * Full-screen red flash shown when an invalid / unrecognized QR is scanned.
 * Animated entry + auto-hide. Tap-anywhere to dismiss early.
 */
export function InvalidQrOverlay({
  trigger,
  message = "Invalid QR code",
  durationMs = 1500,
  rawValue,
}: InvalidQrOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!trigger) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), durationMs);
    return () => clearTimeout(t);
  }, [trigger, durationMs]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      onClick={() => setVisible(false)}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-red-600/90 text-white animate-in fade-in duration-150 cursor-pointer select-none"
    >
      <AlertOctagon className="h-32 w-32 mb-6 drop-shadow-lg" />
      <p className="text-4xl font-bold tracking-tight">{message}</p>
      {rawValue ? (
        <div className="mt-6 max-w-[90vw] rounded-lg bg-black/35 px-4 py-3 text-center backdrop-blur-sm">
          <p className="text-xs uppercase tracking-widest text-white/70">
            Scanner saw ({rawValue.length} chars)
          </p>
          <p className="mt-1 break-all font-mono text-base text-white">
            {visualizeRaw(rawValue)}
          </p>
        </div>
      ) : null}
      <p className="text-lg opacity-80 mt-4">Tap anywhere to dismiss</p>
    </div>
  );
}
