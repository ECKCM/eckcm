"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Coffee, Sun, Moon, Utensils, RefreshCw, WifiOff, Beaker } from "lucide-react";

interface LiveSession {
  id: string;
  label: string | null;
  kind: string;
  mealType: string | null;
  mealDate: string | null;
  startedAt: string;
  eventName: string;
  isSandbox: boolean;
  sessionCount: number;
  mealTotal: number | null;
}

interface LivePayload {
  generatedAt: string;
  sessions: LiveSession[];
}

const POLL_MS = 5000;

const MEAL_LABEL: Record<string, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
};

function MealIcon({ mealType }: { mealType: string | null }) {
  const cls = "h-7 w-7 sm:h-8 sm:w-8";
  if (mealType === "BREAKFAST") return <Coffee className={cls} />;
  if (mealType === "LUNCH") return <Sun className={cls} />;
  if (mealType === "DINNER") return <Moon className={cls} />;
  return <Utensils className={cls} />;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function LiveCountsClient({ token }: { token: string }) {
  const [data, setData] = useState<LivePayload | null>(null);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/live/${token}`, { cache: "no-store" });
      if (!res.ok) {
        setError(true);
        return;
      }
      const payload = (await res.json()) as LivePayload;
      setData(payload);
      setError(false);
      setUpdatedAt(Date.now());
    } catch {
      setError(true);
    }
  }, [token]);

  useEffect(() => {
    poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [poll]);

  // "Updated Ns ago" ticker.
  useEffect(() => {
    const t = setInterval(() => {
      if (updatedAt) setSecondsAgo(Math.floor((Date.now() - updatedAt) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [updatedAt]);

  const sessions = data?.sessions ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4 sm:px-8 sm:py-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            Live Check-in Counts
          </h1>
          <p className="text-sm text-slate-400">
            {sessions.length > 0
              ? `${sessions.length} active scan${sessions.length === 1 ? "" : "s"}`
              : "Active scans appear here in real time"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          {error ? (
            <span className="inline-flex items-center gap-1.5 text-amber-400">
              <WifiOff className="h-4 w-4" /> Reconnecting…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className="h-4 w-4" />
              {updatedAt ? `Updated ${secondsAgo}s ago` : "Loading…"}
            </span>
          )}
        </div>
      </header>

      <main className="p-5 sm:p-8">
        {sessions.length === 0 ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center text-slate-500">
            <Utensils className="mb-4 h-16 w-16 opacity-40" />
            <p className="text-2xl font-medium">No active scans right now</p>
            <p className="mt-1 text-base">
              This board updates automatically when a kiosk starts scanning.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {sessions.map((s) => {
              const mealLabel = s.mealType
                ? MEAL_LABEL[s.mealType] ?? s.mealType
                : s.kind.replace(/_/g, " ");
              const showMealTotal =
                s.mealTotal !== null && s.mealTotal !== s.sessionCount;
              return (
                <div
                  key={s.id}
                  className={`flex flex-col rounded-2xl border p-6 shadow-lg ${
                    s.isSandbox
                      ? "border-purple-600 bg-purple-950/40 ring-1 ring-purple-700"
                      : "border-slate-800 bg-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-3 text-slate-300">
                    <MealIcon mealType={s.mealType} />
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold text-slate-100">
                        {mealLabel}
                      </p>
                      <p className="truncate text-sm text-slate-400">
                        {[fmtDate(s.mealDate), s.eventName]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {s.isSandbox ? (
                      <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-purple-800/60 px-2 py-0.5 text-xs font-medium text-purple-200">
                        <Beaker className="h-3.5 w-3.5" /> Simulation
                      </span>
                    ) : (
                      <span className="ml-auto inline-flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-green-500" />
                    )}
                  </div>

                  <div className="mt-6 flex items-end justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        This scan
                      </p>
                      <p className="text-6xl font-bold tabular-nums sm:text-7xl">
                        {s.sessionCount}
                      </p>
                    </div>
                    {showMealTotal && (
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Whole meal
                        </p>
                        <p className="text-3xl font-semibold tabular-nums text-green-400 sm:text-4xl">
                          {s.mealTotal}
                        </p>
                      </div>
                    )}
                  </div>

                  {s.label && (
                    <p className="mt-4 truncate text-xs text-slate-500">
                      {s.label}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
