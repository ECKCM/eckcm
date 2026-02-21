"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ScanResult } from "./scan-result-card";

interface RecentCheckinsProps {
  checkins: ScanResult[];
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function RecentCheckins({ checkins }: RecentCheckinsProps) {
  if (checkins.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No check-ins yet
      </p>
    );
  }

  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-1">
        {checkins.map((checkin, i) => (
          <div
            key={`${checkin.timestamp.getTime()}-${i}`}
            className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50"
          >
            <div
              className={`h-2 w-2 rounded-full shrink-0 ${
                checkin.status === "checked_in"
                  ? "bg-green-500"
                  : checkin.status === "already_checked_in"
                    ? "bg-amber-500"
                    : "bg-red-500"
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {checkin.person?.name ?? "Unknown"}
                {checkin.person?.koreanName && (
                  <span className="text-muted-foreground ml-1">
                    ({checkin.person.koreanName})
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {checkin.isOffline && (
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  Offline
                </Badge>
              )}
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatRelativeTime(checkin.timestamp)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
