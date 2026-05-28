"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wifi, WifiOff, Database, RefreshCw } from "lucide-react";
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
}: CacheStatusBarProps) {
  const [isOnline, setIsOnline] = useState(true);

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

  return (
    <div className={`flex flex-wrap items-center gap-2 text-sm ${className ?? ""}`}>
      <Badge variant={isOnline ? "default" : "destructive"} className="gap-1">
        {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
        {isOnline ? "Online" : "Offline"}
      </Badge>

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

      {onResync && (
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
    </div>
  );
}
