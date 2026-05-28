"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ScanResult } from "@/components/checkin/scan-result-card";

export interface RealtimeCheckin {
  id: string;
  personId: string;
  eventId: string;
  scanSessionId: string | null;
  sessionId: string | null;
  checkinType: string;
  mealDate: string | null;
  mealType: string | null;
  checkedInAt: string;
  checkedOutAt: string | null;
  status: string;
  isSandbox: boolean;
  person: {
    name: string;
    koreanName: string | null;
    participantCode: string | null;
  };
  confirmationCode: string | null;
}

interface UseRealtimeCheckinsOptions {
  eventId: string | null;
  scanSessionId?: string | null;
  checkinType?: string | null;
  /** Max items to keep client-side. */
  limit?: number;
  /** Disable the hook (skip fetch + subscription). */
  enabled?: boolean;
}

/**
 * Subscribes to live INSERTs on eckcm_checkins for a given event / scan-session
 * and maintains a list of enriched recent check-ins.
 *
 *   - Initial load via /api/checkin/recent (joined query)
 *   - Realtime payload only carries the raw row, so on INSERT we re-fetch the
 *     enriched single row by id and prepend it.
 *   - Multiple operator devices see the same list in near-real-time.
 *
 * Returns ScanResult-shaped entries so they can be passed straight into the
 * existing RecentCheckins component.
 */
export function useRealtimeCheckins({
  eventId,
  scanSessionId,
  checkinType,
  limit = 30,
  enabled = true,
}: UseRealtimeCheckinsOptions) {
  const [checkins, setCheckins] = useState<RealtimeCheckin[]>([]);
  const [loading, setLoading] = useState(false);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (eventId) params.set("eventId", eventId);
    if (scanSessionId) params.set("scanSessionId", scanSessionId);
    if (checkinType) params.set("checkinType", checkinType);
    params.set("limit", String(limit));
    return params.toString();
  }, [eventId, scanSessionId, checkinType, limit]);

  const refresh = useCallback(async () => {
    if (!enabled || !eventId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/checkin/recent?${buildQuery()}`);
      if (res.ok) {
        const data = await res.json();
        setCheckins(data.checkins ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [enabled, eventId, buildQuery]);

  // Initial load + reload whenever filter changes.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime subscription.
  useEffect(() => {
    if (!enabled || !eventId) return;
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }
    const supabase = supabaseRef.current;

    const filter = scanSessionId
      ? `scan_session_id=eq.${scanSessionId}`
      : `event_id=eq.${eventId}`;

    const handleChange = async (payload: { new: { id?: string } }) => {
      const row = payload.new;
      if (!row.id) return;
      try {
        const res = await fetch(`/api/checkin/recent?ids=${row.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const fresh = (data.checkins ?? []) as RealtimeCheckin[];
        if (fresh.length === 0) return;
        setCheckins((prev) => {
          const idx = prev.findIndex((c) => c.id === fresh[0].id);
          if (idx >= 0) {
            // Replace in place — preserves position so check-out updates
            // don't reorder the list jarringly.
            const next = [...prev];
            next[idx] = fresh[0];
            return next;
          }
          return [fresh[0], ...prev].slice(0, limit);
        });
      } catch {
        // ignore individual fetch failures
      }
    };

    const channel = supabase
      .channel(`checkins-${scanSessionId ?? eventId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "eckcm_checkins", filter },
        handleChange
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "eckcm_checkins", filter },
        handleChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, eventId, scanSessionId, limit]);

  return { checkins, loading, refresh };
}

/**
 * Convert a RealtimeCheckin into the ScanResult shape used by RecentCheckins
 * and ScanResultCard. Convenient for showing live + locally-scanned items in
 * one unified list.
 */
export function realtimeCheckinToScanResult(c: RealtimeCheckin): ScanResult {
  const baseStatus: ScanResult["status"] = c.checkedOutAt
    ? "checked_out"
    : "checked_in";
  return {
    status: baseStatus,
    person: {
      name: c.person.name,
      koreanName: c.person.koreanName,
      participantCode: c.person.participantCode,
    },
    confirmationCode: c.confirmationCode ?? undefined,
    checkinType: c.checkinType,
    mealType: c.mealType ?? undefined,
    mealDate: c.mealDate ?? undefined,
    checkedInAt: c.checkedInAt,
    checkedOutAt: c.checkedOutAt ?? undefined,
    timestamp: new Date(c.checkedInAt),
    isOffline: false,
  };
}
