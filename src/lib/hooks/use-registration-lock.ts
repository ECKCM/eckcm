"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface LockInfo {
  registrationId: string;
  userId: string;
  userName: string;
  lockedAt: string;
}

interface UseRegistrationLockReturn {
  locks: Map<string, LockInfo>;
  acquire: (registrationId: string) => void;
  release: () => void;
  isLockedByOther: (registrationId: string) => LockInfo | null;
}

const LOCK_STALE_MS = 60_000; // locks older than 60s are considered expired
const HEARTBEAT_MS = 15_000; // refresh lock timestamp every 15s
const POLL_MS = 3_000; // poll for lock changes every 3s

export function useRegistrationLock(
  userId: string,
  userName: string
): UseRegistrationLockReturn {
  const [locks, setLocks] = useState<Map<string, LockInfo>>(new Map());
  const currentLockRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const supabase = createClient();

  // ─── Keep access token in ref for beforeunload ────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      accessTokenRef.current = data.session?.access_token ?? null;
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      accessTokenRef.current = session?.access_token ?? null;
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  // ─── Load locks from DB ───────────────────────────────────
  const loadLocks = useCallback(async () => {
    const cutoff = new Date(Date.now() - LOCK_STALE_MS).toISOString();
    const { data } = await supabase
      .from("eckcm_registration_locks")
      .select("registration_id, user_id, user_name, locked_at")
      .gt("locked_at", cutoff);

    const next = new Map<string, LockInfo>();
    if (data) {
      for (const row of data) {
        if (row.user_id !== userId) {
          next.set(row.registration_id, {
            registrationId: row.registration_id,
            userId: row.user_id,
            userName: row.user_name,
            lockedAt: row.locked_at,
          });
        }
      }
    }
    setLocks(next);
  }, [userId, supabase]);

  // ─── Poll every 3s ────────────────────────────────────────
  useEffect(() => {
    loadLocks();
    const timer = setInterval(loadLocks, POLL_MS);
    return () => clearInterval(timer);
  }, [loadLocks]);

  // ─── Heartbeat: keep our lock alive ───────────────────────
  useEffect(() => {
    const timer = setInterval(async () => {
      const regId = currentLockRef.current;
      if (!regId) return;
      await supabase
        .from("eckcm_registration_locks")
        .update({ locked_at: new Date().toISOString() })
        .eq("registration_id", regId)
        .eq("user_id", userId);
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [userId, supabase]);

  // ─── beforeunload: release lock on tab close ──────────────
  useEffect(() => {
    const handleUnload = () => {
      const regId = currentLockRef.current;
      if (!regId) return;
      const token = accessTokenRef.current;
      if (!token) return;

      const url =
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/eckcm_registration_locks` +
        `?registration_id=eq.${regId}&user_id=eq.${userId}`;

      fetch(url, {
        method: "DELETE",
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${token}`,
        },
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [userId]);

  // ─── Cleanup on unmount (page navigation) ─────────────────
  useEffect(() => {
    return () => {
      if (currentLockRef.current) {
        supabase
          .from("eckcm_registration_locks")
          .delete()
          .eq("registration_id", currentLockRef.current)
          .eq("user_id", userId)
          .then(() => {});
      }
    };
  }, [userId, supabase]);

  // ─── Acquire ──────────────────────────────────────────────
  const acquire = useCallback(
    async (registrationId: string) => {
      // Release previous lock
      if (currentLockRef.current && currentLockRef.current !== registrationId) {
        await supabase
          .from("eckcm_registration_locks")
          .delete()
          .eq("registration_id", currentLockRef.current)
          .eq("user_id", userId);
      }

      // Clean stale locks
      const cutoff = new Date(Date.now() - LOCK_STALE_MS).toISOString();
      await supabase
        .from("eckcm_registration_locks")
        .delete()
        .lt("locked_at", cutoff);

      // Insert/update our lock
      await supabase.from("eckcm_registration_locks").upsert(
        {
          registration_id: registrationId,
          user_id: userId,
          user_name: userName,
          locked_at: new Date().toISOString(),
        },
        { onConflict: "registration_id" }
      );

      currentLockRef.current = registrationId;
      loadLocks(); // immediately refresh lock state
    },
    [userId, userName, supabase, loadLocks]
  );

  // ─── Release ──────────────────────────────────────────────
  const release = useCallback(async () => {
    const regId = currentLockRef.current;
    currentLockRef.current = null;
    if (!regId) return;

    await supabase
      .from("eckcm_registration_locks")
      .delete()
      .eq("registration_id", regId)
      .eq("user_id", userId);

    loadLocks(); // immediately refresh lock state
  }, [userId, supabase, loadLocks]);

  // ─── Check ────────────────────────────────────────────────
  const isLockedByOther = useCallback(
    (registrationId: string): LockInfo | null => {
      return locks.get(registrationId) ?? null;
    },
    [locks]
  );

  return { locks, acquire, release, isLockedByOther };
}
