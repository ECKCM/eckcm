"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type ChangeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

interface UseRealtimeOptions {
  table: string;
  schema?: string;
  event?: ChangeEvent;
  filter?: string;
  enabled?: boolean;
}

/**
 * Subscribe to Supabase Realtime changes on a table.
 * Also sets up smart polling that only fires the callback when data changes.
 */
export function useRealtime<T extends Record<string, unknown> = Record<string, unknown>>(
  options: UseRealtimeOptions,
  callback: (payload: RealtimePostgresChangesPayload<T>) => void
) {
  const { table, schema = "public", event = "*", filter, enabled = true } = options;
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      const supabase = createClient();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    const supabase = createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelConfig: any = {
      event,
      schema,
      table,
    };
    if (filter) channelConfig.filter = filter;

    const channel = supabase
      .channel(`realtime:${table}:${filter ?? "all"}`)
      .on(
        "postgres_changes" as never,
        channelConfig,
        (payload: RealtimePostgresChangesPayload<T>) => {
          callbackRef.current(payload);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return cleanup;
  }, [table, schema, event, filter, enabled, cleanup]);
}

/**
 * Smart polling hook — checks MAX(updated_at) on a table and only
 * fires the callback when the value changes. No UI flicker.
 *
 * @param table  - table name to poll
 * @param callback - called only when data has changed
 * @param interval - poll interval in ms (default 5000)
 * @param filter - optional Supabase filter like { column: "event_id", value: "..." }
 */
export function useChangeDetector(
  table: string,
  callback: () => void,
  interval = 5000,
  filterOpts?: { column: string; value: string }
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const lastFingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const checkForChanges = async () => {
      let query = supabase
        .from(table)
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (filterOpts) {
        query = query.eq(filterOpts.column, filterOpts.value);
      }

      const { data } = await query;
      const fingerprint = data?.[0]?.updated_at ?? "";

      if (lastFingerprintRef.current === null) {
        // First check — just store the value, don't trigger callback
        lastFingerprintRef.current = fingerprint;
        return;
      }

      if (fingerprint !== lastFingerprintRef.current) {
        lastFingerprintRef.current = fingerprint;
        callbackRef.current();
      }
    };

    const timer = setInterval(checkForChanges, interval);
    // Initial check to set baseline
    checkForChanges();

    return () => clearInterval(timer);
  }, [table, interval, filterOpts?.column, filterOpts?.value]); // eslint-disable-line react-hooks/exhaustive-deps
}
