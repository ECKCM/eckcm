"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface CameraDevice {
  deviceId: string;
  label: string;
  /** Heuristic guess at orientation based on the device label. */
  facing: "user" | "environment" | "unknown";
}

export type CameraFacing = "user" | "environment";

interface UseCameraDevicesOptions {
  /** Default facing the scanner should select when no preference is stored. */
  defaultFacing?: CameraFacing;
  /** Persistence key for the selected deviceId. */
  storageKey?: string;
  /** Whether to attempt enumeration (skip if permission isn't granted yet). */
  enabled?: boolean;
}

function guessFacing(label: string): CameraDevice["facing"] {
  const l = label.toLowerCase();
  if (/back|rear|environment|world/.test(l)) return "environment";
  if (/front|face|user|selfie/.test(l)) return "user";
  return "unknown";
}

/**
 * Enumerate available video input devices and manage a selected deviceId.
 *
 * Notes:
 *   - Browsers only populate device labels after camera permission is granted.
 *   - On most phones, `enumerateDevices()` returns multiple back cameras
 *     (wide/ultrawide/tele); we pick the first matching facing as the default.
 *   - The selected deviceId is persisted in localStorage so a kiosk remembers
 *     the camera that was set during initial setup.
 */
export function useCameraDevices({
  defaultFacing = "environment",
  storageKey = "checkin.cameraDeviceId",
  enabled = true,
}: UseCameraDevicesOptions = {}) {
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const initializedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    setLoading(true);
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const cameras: CameraDevice[] = list
        .filter((d) => d.kind === "videoinput")
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${i + 1}`,
          facing: guessFacing(d.label),
        }));
      setDevices(cameras);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial enumeration + react to device hot-plugs.
  useEffect(() => {
    if (!enabled) return;
    refresh();
    const onChange = () => {
      refresh();
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
    };
  }, [enabled, refresh]);

  // Pick a sensible default once devices are known.
  useEffect(() => {
    if (initializedRef.current) return;
    if (devices.length === 0) return;

    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    const storedMatch = stored && devices.find((d) => d.deviceId === stored);

    if (storedMatch) {
      setSelectedDeviceIdState(storedMatch.deviceId);
    } else {
      const preferred =
        devices.find((d) => d.facing === defaultFacing) ??
        devices.find((d) => d.facing === "unknown") ??
        devices[0];
      setSelectedDeviceIdState(preferred.deviceId);
    }
    initializedRef.current = true;
  }, [devices, defaultFacing, storageKey]);

  const setSelectedDeviceId = useCallback(
    (deviceId: string) => {
      setSelectedDeviceIdState(deviceId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, deviceId);
      }
    },
    [storageKey]
  );

  const selectedDevice =
    devices.find((d) => d.deviceId === selectedDeviceId) ?? null;

  return {
    devices,
    selectedDeviceId,
    selectedDevice,
    setSelectedDeviceId,
    refresh,
    loading,
  };
}
