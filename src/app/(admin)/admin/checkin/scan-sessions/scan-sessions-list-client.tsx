"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CircleDot,
  Pause,
  Square,
  Beaker,
  ChevronRight,
  Loader2,
} from "lucide-react";
import type { ScanSession } from "@/lib/types/checkin";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "ENDED", label: "Ended" },
];

function StatusBadge({ status }: { status: ScanSession["status"] }) {
  if (status === "ACTIVE") {
    return (
      <Badge className="gap-1 bg-green-600 hover:bg-green-700">
        <CircleDot className="h-3 w-3 animate-pulse" /> Active
      </Badge>
    );
  }
  if (status === "PAUSED") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Pause className="h-3 w-3" /> Paused
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Square className="h-3 w-3" /> Ended
    </Badge>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString();
}

export function ScanSessionsListClient({ events }: { events: EventOption[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sessions, setSessions] = useState<ScanSession[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    const params = new URLSearchParams({ eventId, limit: "100" });
    if (statusFilter !== "all") params.set("status", statusFilter);
    fetch(`/api/scan-sessions?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setSessions(data.scanSessions ?? []))
      .finally(() => setLoading(false));
  }, [eventId, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="w-full sm:w-[260px]">
            <SelectValue placeholder="Select event" />
          </SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name_en} ({e.year})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            {STATUS_FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No scan sessions in this filter.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <Link key={s.id} href={`/admin/checkin/scan-sessions/${s.id}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <StatusBadge status={s.status} />
                  {s.is_sandbox && (
                    <Badge variant="outline" className="gap-1 border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-300">
                      <Beaker className="h-3 w-3" /> Sandbox
                    </Badge>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {s.label ?? s.kind.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.kind} · started {formatTime(s.started_at)}
                      {s.ended_at && ` · ended ${formatTime(s.ended_at)}`}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
