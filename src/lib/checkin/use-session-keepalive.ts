"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps a long-running kiosk session alive on devices that are left on for
 * days (e.g. a meal-check-in iPad).
 *
 * The Supabase browser client auto-refreshes the access token on a timer, but
 * that timer is throttled or frozen while the tab is backgrounded or the device
 * is asleep. When the iPad wakes hours later the access token may already be
 * expired; the next API call then 401s and middleware bounces the kiosk to
 * /login mid-meal — exactly the forced sign-out we must avoid.
 *
 * This hook proactively refreshes the session:
 *   - on a periodic timer (default 10 min, well under the 1h token lifetime),
 *   - whenever the tab becomes visible again (wake from sleep / tab switch),
 *   - whenever connectivity is restored (`online`).
 *
 * `getSession()` transparently refreshes the token when it's near/after expiry,
 * so a single call is enough. Failures are swallowed: a transient network blip
 * shouldn't surface anything to the operator, and the next tick retries. The
 * combination of middleware exempting UPJ_STAFF from the 24h cap + this
 * keep-alive means the kiosk account effectively never gets signed out while
 * the page stays open.
 */
export function useSessionKeepalive({
  intervalMs = 10 * 60 * 1000,
  enabled = true,
}: { intervalMs?: number; enabled?: boolean } = {}) {
  // Stash the latest interval so the effect doesn't re-subscribe on every change.
  const intervalRef = useRef(intervalMs);
  intervalRef.current = intervalMs;

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const supabase = createClient();
    let cancelled = false;

    const refresh = async () => {
      if (cancelled) return;
      try {
        // getSession() refreshes the access token under the hood when it is
        // expired or about to expire, and persists the new token to storage.
        await supabase.auth.getSession();
      } catch {
        // Network blip or transient auth error — leave the session as-is and
        // let the next tick / visibility event retry. Never sign the kiosk out.
      }
    };

    const timer = window.setInterval(refresh, intervalRef.current);

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onOnline = () => refresh();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", refresh);

    // Refresh once on mount so a page that loads with a stale token recovers
    // immediately instead of waiting a full interval.
    refresh();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", refresh);
    };
  }, [enabled]);
}
