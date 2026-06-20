"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Wifi,
  WifiOff,
  Database,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { CacheStatus } from "@/lib/checkin/use-epass-cache";

interface CacheStatusBarProps {
  status: CacheStatus;
  count: number;
  onResync?: () => void;
  /** Optional count of offline check-ins waiting to sync. */
  pendingSyncCount?: number;
  onSyncPending?: () => void;
  syncing?: boolean;
  className?: string;
  /**
   * Phone-first surfaces (main check-in) collapse the cache details behind a
   * toggle so only the essential connectivity + pending-sync signal shows.
   * The full bar stays the default for desktop scanner stations.
   */
  collapsible?: boolean;
}

/**
 * Always-visible connectivity + cache indicator for every scanner surface.
 *
 * Because the check-in app runs as a PWA that must keep working offline,
 * operators need a persistent, glanceable signal of:
 *   - Online / Offline (network state)
 *   - How many e-passes are cached locally (so scanning works offline)
 *   - A resync button to force-refresh the cache
 *   - Any pending offline check-ins still waiting to upload
 *
 * Network state is tracked here so the bar is self-contained — drop it into
 * any surface that already has a useEpassCache instance.
 */
export function CacheStatusBar({
  status,
  count,
  onResync,
  pendingSyncCount = 0,
  onSyncPending,
  syncing = false,
  className,
  collapsible = false,
}: CacheStatusBarProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Cache count + Resync are details; hide them on collapsible surfaces until
  // the operator expands. Connectivity and pending-sync always stay visible.
  const showDetails = !collapsible || expanded;

  return (
    <div className={`flex flex-wrap items-center gap-2 text-sm ${className ?? ""}`}>
      <Badge variant={isOnline ? "default" : "destructive"} className="gap-1">
        {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
        {isOnline ? "Online" : "Offline"}
      </Badge>

      {showDetails && (
        <Badge
          variant={
            status === "ready"
              ? "secondary"
              : status === "error"
                ? "destructive"
                : "outline"
          }
          className="gap-1"
        >
          <Database className="h-3 w-3" />
          {status === "loading"
            ? "Syncing cache…"
            : status === "ready"
              ? `Cache: ${count}`
              : status === "error"
                ? "Cache error"
                : "No cache"}
        </Badge>
      )}

      {showDetails && onResync && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onResync}
          className="h-6 px-2 text-xs gap-1"
        >
          <RefreshCw
            className={`h-3 w-3 ${status === "loading" ? "animate-spin" : ""}`}
          />
          Resync
        </Button>
      )}

      {pendingSyncCount > 0 && (
        <Badge variant="outline" className="gap-1">
          <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : `${pendingSyncCount} pending`}
        </Badge>
      )}
      {pendingSyncCount > 0 && isOnline && !syncing && onSyncPending && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onSyncPending}
          className="h-6 px-2 text-xs"
        >
          Sync now
        </Button>
      )}

      {collapsible && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className="h-6 px-2 text-xs gap-1 ml-auto"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" /> Less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> Cache
            </>
          )}
        </Button>
      )}
    </div>
  );
}
