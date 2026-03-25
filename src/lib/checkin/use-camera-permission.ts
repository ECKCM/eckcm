"use client";

import { useState, useEffect, useCallback } from "react";
import { getCameraPermissionState } from "./camera-utils";

export type CameraPermissionStatus =
  | "checking"
  | "prompt"
  | "granted"
  | "denied";

/**
 * Hook that manages camera permission state.
 *
 * Flow:
 * 1. On mount, checks Permissions API (no getUserMedia call).
 * 2. If already "granted" → Scanner can mount immediately.
 * 3. If "prompt"/"unknown" → show a button; when clicked, allow()
 *    sets status to "granted" so the Scanner mounts and its internal
 *    getUserMedia triggers the browser permission dialog.
 * 4. If Scanner's onError fires → call deny() to show blocked UI.
 *
 * This avoids a double getUserMedia call (pre-check + Scanner).
 */
export function useCameraPermission() {
  const [status, setStatus] = useState<CameraPermissionStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const state = await getCameraPermissionState();
      if (cancelled) return;
      if (state === "granted") {
        setStatus("granted");
      } else if (state === "denied") {
        setStatus("denied");
      } else {
        // "prompt" or "unknown" (iOS Safari) — need user gesture
        setStatus("prompt");
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Let the Scanner mount; its getUserMedia will show the browser prompt. */
  const allow = useCallback(() => {
    setStatus("granted");
  }, []);

  /** Called when Scanner's onError fires — camera access failed. */
  const deny = useCallback(() => {
    setStatus("denied");
  }, []);

  return { status, allow, deny };
}
