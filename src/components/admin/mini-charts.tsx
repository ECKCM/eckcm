"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Dependency-free SVG charts for the admin dashboard. Kept intentionally small
 * (no charting library) and theme-aware via `currentColor`, so a parent sets the
 * accent with a text-color class (e.g. `text-primary`).
 */

export interface TrendPoint {
  /** X-axis label for the tooltip (e.g. "Mar 14"). */
  label: string;
  value: number;
}

const TOP_PAD = 0.14;
const BOT_PAD = 0.08;
const USABLE = 1 - TOP_PAD - BOT_PAD;

/**
 * Responsive area + line chart with a hover tooltip. Stroke stays crisp at any
 * width via `vector-effect: non-scaling-stroke` + `preserveAspectRatio: none`.
 */
export function TrendAreaChart({
  data,
  height = 180,
  className,
  valueFormatter = (v) => String(v),
  emptyLabel = "No data",
}: {
  data: TrendPoint[];
  height?: number;
  className?: string;
  valueFormatter?: (v: number) => string;
  emptyLabel?: string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const xFrac = (i: number) => (n === 1 ? 0.5 : i / (n - 1));
  const yFrac = (v: number) => TOP_PAD + (1 - v / max) * USABLE;

  const W = 1000;
  const H = 1000;
  const pts = data.map((d, i) => ({ x: xFrac(i) * W, y: yFrac(d.value) * H }));
  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const baseline = (TOP_PAD + USABLE) * H;
  const areaPath = `${linePath} L${pts[n - 1].x.toFixed(1)},${baseline.toFixed(
    1
  )} L${pts[0].x.toFixed(1)},${baseline.toFixed(1)} Z`;

  const active = hover != null ? data[hover] : null;

  return (
    <div className={cn("relative w-full text-primary", className)} style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Hover marker (vertical guide + dot), positioned in % space. */}
      {active && hover != null && (
        <>
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary/30"
            style={{ left: `${xFrac(hover) * 100}%` }}
          />
          <div
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary"
            style={{
              left: `${xFrac(hover) * 100}%`,
              top: `${yFrac(active.value) * 100}%`,
            }}
          />
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-center shadow-md"
            style={{
              left: `${Math.min(92, Math.max(8, xFrac(hover) * 100))}%`,
              top: `${yFrac(active.value) * 100}%`,
              marginTop: -8,
            }}
          >
            <div className="text-xs font-semibold leading-tight">
              {valueFormatter(active.value)}
            </div>
            <div className="text-[10px] leading-tight text-muted-foreground">
              {active.label}
            </div>
          </div>
        </>
      )}

      {/* Invisible hover columns capture the nearest point. */}
      <div
        className="absolute inset-0 flex"
        onMouseLeave={() => setHover(null)}
      >
        {data.map((d, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${d.label}: ${valueFormatter(d.value)}`}
            className="h-full flex-1 cursor-default"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
          />
        ))}
      </div>
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  /** Optional Tailwind text-color class driving the bar (defaults to primary). */
  colorClass?: string;
}

/**
 * Horizontal bar list for category breakdowns (status mix, top groups, …).
 */
export function BarList({
  data,
  valueFormatter = (v) => String(v),
  emptyLabel = "No data",
  className,
}: {
  data: BarDatum[];
  valueFormatter?: (v: number) => string;
  emptyLabel?: string;
  className?: string;
}) {
  if (data.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={cn("space-y-2.5", className)}>
      {data.map((d, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-muted-foreground">{d.label}</span>
            <span className="font-medium tabular-nums">
              {valueFormatter(d.value)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full bg-current",
                d.colorClass ?? "text-primary"
              )}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
