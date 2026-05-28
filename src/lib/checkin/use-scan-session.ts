"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ScanSession,
  ScanSessionKind,
  ScanSessionStatus,
} from "@/lib/types/checkin";

interface StartArgs {
  eventId: string;
  kind: ScanSessionKind;
  label?: string;
  mealDate?: string;
  sessionId?: string;
  isSandbox?: boolean;
}

interface UseScanSessionOptions {
  /** Persist the active session id in localStorage so refresh restores it. */
  storageKey?: string;
}

/**
 * Hook for managing one scan session per surface (e.g. one per meal scanner).
 *
 *   - `start({...})` creates a new session on the server and stores its id.
 *   - `pause` / `resume` / `end` PATCH the lifecycle.
 *   - The session is persisted in localStorage so a refresh restores it.
 *
 * A surface should usually disable scanning unless `session?.status === "ACTIVE"`.
 */
export function useScanSession({
  storageKey = "checkin.scanSessionId",
}: UseScanSessionOptions = {}) {
  const [session, setSession] = useState<ScanSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // Restore from localStorage on mount.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;
    (async () => {
      try {
        const res = await fetch(`/api/scan-sessions/${stored}`);
        if (res.ok) {
          const data = await res.json();
          const restored = data.scanSession as ScanSession;
          // Only restore if it's still actionable. Ended sessions are cleared.
          if (restored.status === "ENDED") {
            window.localStorage.removeItem(storageKey);
          } else {
            setSession(restored);
          }
        } else {
          window.localStorage.removeItem(storageKey);
        }
      } catch {
        // Network blip — leave session null; user can retry.
      }
    })();
  }, [storageKey]);

  const persistSession = useCallback(
    (s: ScanSession | null) => {
      setSession(s);
      if (typeof window === "undefined") return;
      if (s && s.status !== "ENDED") {
        window.localStorage.setItem(storageKey, s.id);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    },
    [storageKey]
  );

  const start = useCallback(
    async (args: StartArgs) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/scan-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to start scan session");
          return null;
        }
        persistSession(data.scanSession as ScanSession);
        return data.scanSession as ScanSession;
      } finally {
        setLoading(false);
      }
    },
    [persistSession]
  );

  const transition = useCallback(
    async (action: "pause" | "resume" | "end") => {
      if (!session) return null;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/scan-sessions/${session.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? `Failed to ${action} scan session`);
          return null;
        }
        const updated = data.scanSession as ScanSession;
        persistSession(updated);
        return updated;
      } finally {
        setLoading(false);
      }
    },
    [session, persistSession]
  );

  const attach = useCallback(
    (s: ScanSession) => {
      persistSession(s);
    },
    [persistSession]
  );

  const detach = useCallback(() => {
    persistSession(null);
  }, [persistSession]);

  /** Pull the latest server-side state of the current session. */
  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch(`/api/scan-sessions/${session.id}`);
      if (res.ok) {
        const data = await res.json();
        const fresh = data.scanSession as ScanSession;
        if (fresh.status === "ENDED") {
          detach();
        } else {
          persistSession(fresh);
        }
      }
    } catch {
      // ignore
    }
  }, [session, detach, persistSession]);

  const status: ScanSessionStatus | null = session?.status ?? null;

  return {
    session,
    status,
    loading,
    error,
    start,
    pause: () => transition("pause"),
    resume: () => transition("resume"),
    end: () => transition("end"),
    attach,
    detach,
    refresh,
    canScan: status === "ACTIVE",
  };
}
