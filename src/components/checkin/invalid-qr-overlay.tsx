"use client";

import { useEffect, useState } from "react";
import { AlertOctagon } from "lucide-react";

interface InvalidQrOverlayProps {
  /** When this changes to a truthy value, the overlay flashes. */
  trigger: number | null;
  message?: string;
  /** Auto-hide duration in ms. Defaults to 1500. */
  durationMs?: number;
}

/**
 * Full-screen red flash shown when an invalid / unrecognized QR is scanned.
 * Animated entry + auto-hide. Tap-anywhere to dismiss early.
 */
export function InvalidQrOverlay({
  trigger,
  message = "Invalid QR code",
  durationMs = 1500,
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
      <p className="text-lg opacity-80 mt-2">Tap anywhere to dismiss</p>
    </div>
  );
}
