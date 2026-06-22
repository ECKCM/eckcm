"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  cacheEPassData,
  getCacheCount,
  lookupByParticipantCode,
  lookupToken,
} from "@/lib/checkin/offline-store";
import type { ParsedQR } from "@/lib/checkin/qr-parser";

interface UseEpassCacheOptions {
  /** Event whose participants we want cached. Hook idles when null. */
  eventId: string | null;
  /** Optional callback fired after every successful (re)sync. */
  onSync?: (count: number) => void;
}

export type CacheStatus = "idle" | "loading" | "ready" | "error";

export interface CacheLookupHit {
  /** Plain participant code (without HMAC). Useful for log entries. */
  participantCode: string | null;
  /** Signed code as stored in IndexedDB — used for offline pending submits. */
  signedCode: string | null;
  personName: string;
  koreanName: string | null;
  confirmationCode: string;
  isActive: boolean;
  registrationStatus: string;
  /** YYYY-MM-DD. Combined with eventStartDate to derive the meal tier offline. */
  birthDate: string | null;
  /** YYYY-MM-DD. Pairs with birthDate for the meal-tier calculation. */
  eventStartDate: string | null;
  /** "MALE" | "FEMALE" | null — shown as a badge on the result card. */
  gender: string | null;
  /** Effective stay window (YYYY-MM-DD) — gates meals to attendance days. */
  stayStartDate: string | null;
  stayEndDate: string | null;
}

/**
 * Maintains an offline IndexedDB cache of all active e-passes for the event:
 *
 *  - Initial load when `eventId` is set, or when the operator starts a scan
 *    session (call `refresh()` then).
 *  - Subscribes to realtime INSERT/UPDATE on `eckcm_group_memberships`
 *    filtered to the event. When a new walk-in registration finalizes, the
 *    cache silently refreshes so the next scan can resolve them locally.
 *  - Periodic safety refresh every 5 minutes in case realtime drops.
 *
 * Exposes `lookup(parsed)` for cache-first participant resolution — used by
 * scanner surfaces for instant UX before the verify round-trip lands.
 */
export function useEpassCache({ eventId, onSync }: UseEpassCacheOptions) {
  const [status, setStatus] = useState<CacheStatus>("idle");
  const [count, setCount] = useState<number>(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const onSyncRef = useRef(onSync);

  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    setStatus("loading");
    try {
      const res = await fetch(`/api/checkin/epass-cache?eventId=${eventId}`);
      if (!res.ok) throw new Error("Failed to fetch e-pass cache");
      const data = await res.json();
      await cacheEPassData(data.tokens ?? []);
      const c = await getCacheCount();
      setCount(c);
      setLastSyncedAt(Date.now());
      setStatus("ready");
      onSyncRef.current?.(c);
    } catch {
      setStatus("error");
    }
  }, [eventId]);

  // Initial load whenever the event changes.
  useEffect(() => {
    if (!eventId) {
      setStatus("idle");
      return;
    }
    refresh();
  }, [eventId, refresh]);

  // Realtime: refresh cache when a membership row is inserted/updated.
  // Filtering by the join key isn't possible on memberships (the event lives
  // two tables over), so we accept the noise and re-fetch on any event;
  // refresh cost is one cheap join query.
  useEffect(() => {
    if (!eventId) return;
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const supabase = supabaseRef.current;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(refresh, 800);
    };

    const channel = supabase
      .channel(`epass-cache-${eventId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "eckcm_group_memberships" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "eckcm_group_memberships" },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [eventId, refresh]);

  // Periodic safety refresh in case realtime drops a message (e.g., network
  // blip). 5-minute interval is short enough that operators rarely notice a
  // missed walk-in, but long enough not to spam the API.
  useEffect(() => {
    if (!eventId) return;
    const t = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [eventId, refresh]);

  /**
   * Cache-first lookup. Returns the participant data if present in IndexedDB
   * (instant), or null if the operator needs to fall back to the server.
   */
  const lookup = useCallback(async (parsed: ParsedQR): Promise<CacheLookupHit | null> => {
    if (parsed.kind === "participantCode") {
      const plain = parsed.participantCode.includes(".")
        ? parsed.participantCode.split(".")[0]
        : parsed.participantCode;
      const entry = await lookupByParticipantCode(plain);
      if (!entry) return null;
      return {
        participantCode: entry.participantCode,
        signedCode: entry.signedCode,
        personName: entry.personName,
        koreanName: entry.koreanName,
        confirmationCode: entry.confirmationCode,
        isActive: entry.isActive,
        registrationStatus: entry.registrationStatus,
        birthDate: entry.birthDate ?? null,
        eventStartDate: entry.eventStartDate ?? null,
        gender: entry.gender ?? null,
        stayStartDate: entry.stayStartDate ?? null,
        stayEndDate: entry.stayEndDate ?? null,
      };
    }
    const entry = await lookupToken(parsed.token);
    if (!entry) return null;
    return {
      participantCode: entry.participantCode,
      signedCode: entry.signedCode,
      personName: entry.personName,
      koreanName: entry.koreanName,
      confirmationCode: entry.confirmationCode,
      isActive: entry.isActive,
      registrationStatus: entry.registrationStatus,
      birthDate: entry.birthDate ?? null,
      eventStartDate: entry.eventStartDate ?? null,
      gender: entry.gender ?? null,
      stayStartDate: entry.stayStartDate ?? null,
      stayEndDate: entry.stayEndDate ?? null,
    };
  }, []);

  return {
    status,
    count,
    lastSyncedAt,
    refresh,
    lookup,
  };
}
