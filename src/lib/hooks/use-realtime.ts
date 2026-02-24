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
 *
 * @example
 * useRealtime({
 *   table: "eckcm_checkins",
 *   event: "INSERT",
 *   filter: `event_id=eq.${eventId}`,
 * }, (payload) => {
 *   console.log("New checkin:", payload.new);
 * });
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
