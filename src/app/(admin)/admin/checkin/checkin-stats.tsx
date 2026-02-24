"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw,
  Users,
  UserCheck,
  UtensilsCrossed,
  Presentation,
  TrendingUp,
} from "lucide-react";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
}

interface StatsData {
  totalRegistrations: number;
  totalPeople: number;
  checkins: {
    total: number;
    main: number;
    dining: number;
    session: number;
  };
  arrivalRate: {
    checkedIn: number;
    total: number;
    percentage: number;
  };
  hourlyDistribution: Record<string, number>;
  last24h: {
    MAIN: number;
    DINING: number;
    SESSION: number;
  };
}

export function CheckinStats({ events }: { events: EventOption[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/checkin/stats?eventId=${eventId}`);
      if (res.ok) {
        setStats(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const maxHourlyCount = stats
    ? Math.max(...Object.values(stats.hourlyDistribution), 1)
    : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
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

        <Button
          variant="outline"
          size="sm"
          onClick={loadStats}
          disabled={loading}
          className="gap-1"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {!stats ? (
        <p className="text-center text-muted-foreground py-12">
          {loading ? "Loading statistics..." : "No data available"}
        </p>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  Registered
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.totalPeople}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.totalRegistrations} registration(s)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4" />
                  Arrived
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {stats.arrivalRate.checkedIn}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats.arrivalRate.percentage}% of registered
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <UtensilsCrossed className="h-4 w-4" />
                  Dining
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.checkins.dining}</p>
                <p className="text-xs text-muted-foreground">total scans</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Presentation className="h-4 w-4" />
                  Sessions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.checkins.session}</p>
                <p className="text-xs text-muted-foreground">total scans</p>
              </CardContent>
            </Card>
          </div>

          {/* Arrival Progress */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Arrival Rate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {stats.arrivalRate.checkedIn} / {stats.arrivalRate.total}{" "}
                  people checked in
                </span>
                <Badge variant="secondary">{stats.arrivalRate.percentage}%</Badge>
              </div>
              <Progress value={stats.arrivalRate.percentage} className="h-3" />
            </CardContent>
          </Card>

          {/* Last 24h by Type */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Last 24 Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">{stats.last24h.MAIN}</p>
                  <p className="text-xs text-muted-foreground">Main</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">{stats.last24h.DINING}</p>
                  <p className="text-xs text-muted-foreground">Dining</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">{stats.last24h.SESSION}</p>
                  <p className="text-xs text-muted-foreground">Session</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Hourly Distribution (Today) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Today&apos;s Hourly Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(stats.hourlyDistribution).length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">
                  No check-ins today yet
                </p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(stats.hourlyDistribution)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([hour, count]) => (
                      <div key={hour} className="flex items-center gap-3">
                        <span className="text-sm font-mono w-12 text-muted-foreground">
                          {hour}
                        </span>
                        <div className="flex-1 h-6 bg-muted/30 rounded overflow-hidden">
                          <div
                            className="h-full bg-primary/70 rounded transition-all"
                            style={{
                              width: `${(count / maxHourlyCount) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium w-8 text-right">
                          {count}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Total Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">All-Time Totals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Check-ins</p>
                  <p className="text-xl font-bold">{stats.checkins.total}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Main</p>
                  <p className="text-xl font-bold">{stats.checkins.main}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Dining</p>
                  <p className="text-xl font-bold">{stats.checkins.dining}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sessions</p>
                  <p className="text-xl font-bold">{stats.checkins.session}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
