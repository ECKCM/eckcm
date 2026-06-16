"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer, Loader2, Grid3x3, RotateCcw, X } from "lucide-react";
import {
  PRINT_CSS,
  STATUS_OPTIONS,
  BADGES_PER_SHEET,
  LanyardSheets,
  useLanyardData,
  type Badge,
} from "./lanyard-shared";

/* Searchable text + display label for a participant badge. */
function badgeSearchText(b: Badge): string {
  return [b.nameKo, b.nameEn, b.church, b.participantCode, b.confirmationCode, b.groupCode]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
function badgeLabel(b: Badge): string {
  const name = b.nameKo ? `${b.nameKo} (${b.nameEn})` : b.nameEn;
  const extras = [b.church, b.participantCode].filter(Boolean).join(" · ");
  return extras ? `${name} — ${extras}` : name;
}

export default function PrintLanyardPage() {
  const {
    events,
    eventId,
    setEventId,
    status,
    setStatus,
    badges,
    loading,
    loaded,
    loadBadges,
  } = useLanyardData();

  // Layout + print calibration (persisted per browser/printer).
  const [showGrid, setShowGrid] = useState(false);
  const [calibrate, setCalibrate] = useState(false);
  const [onePage, setOnePage] = useState(false); // limit render to a single sheet
  const [scale, setScale] = useState(100); // percent
  const [offsetX, setOffsetX] = useState(0); // mm
  const [offsetY, setOffsetY] = useState(0); // mm

  // Manual cell assignment.
  const [manualMode, setManualMode] = useState(false);
  const [assignments, setAssignments] = useState<(Badge | null)[]>(() =>
    Array.from({ length: BADGES_PER_SHEET }, () => null)
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem("lanyard-calibration");
      if (raw) {
        const c = JSON.parse(raw);
        if (typeof c.scale === "number") setScale(c.scale);
        if (typeof c.offsetX === "number") setOffsetX(c.offsetX);
        if (typeof c.offsetY === "number") setOffsetY(c.offsetY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "lanyard-calibration",
      JSON.stringify({ scale, offsetX, offsetY })
    );
  }, [scale, offsetX, offsetY]);

  const resetCalibration = () => {
    setScale(100);
    setOffsetX(0);
    setOffsetY(0);
  };

  const assignCell = (i: number, b: Badge | null) =>
    setAssignments((prev) => prev.map((x, idx) => (idx === i ? b : x)));
  const clearAssignments = () =>
    setAssignments(Array.from({ length: BADGES_PER_SHEET }, () => null));

  // Badges actually rendered.
  const bulkBadges = onePage ? badges.slice(0, BADGES_PER_SHEET) : badges;
  const renderBadges: (Badge | null)[] = manualMode ? assignments : bulkBadges;

  const filledCount = manualMode
    ? assignments.filter(Boolean).length
    : bulkBadges.length;
  const sheetCount = calibrate
    ? 1
    : Math.max(1, Math.ceil(renderBadges.length / BADGES_PER_SHEET));

  const rootStyle = {
    ["--cal-scale" as string]: String(scale / 100),
    ["--cal-x" as string]: `${offsetX}mm`,
    ["--cal-y" as string]: `${offsetY}mm`,
  } as React.CSSProperties;

  return (
    <div className="lanyard-root flex flex-col" style={rootStyle}>
      <style>{PRINT_CSS}</style>

      {/* Header */}
      <div className="lanyard-no-print flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Print Lanyards</h1>
        <span className="text-xs text-muted-foreground">
          Avery 5390 · 8 per sheet · 3.5&quot; × 2.25&quot;
        </span>
        <a
          href="/admin/print/lanyard/test"
          className="ml-auto text-xs text-blue-600 underline"
        >
          Open test page →
        </a>
      </div>

      {/* Controls */}
      <div className="lanyard-no-print space-y-4 p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Event</label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Select event..." />
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name_en} ({e.year})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() => {
              setManualMode(false);
              setOnePage(false);
              loadBadges();
            }}
            disabled={loading || !eventId}
          >
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Load Participants
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              setManualMode(false);
              setOnePage(true);
              loadBadges();
            }}
            disabled={loading || !eventId}
            title="Render only the first sheet (8 badges) for a quick test"
          >
            1 Page (test)
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              setManualMode(true);
              setOnePage(false);
              if (badges.length === 0) loadBadges("ALL");
            }}
            disabled={loading || !eventId}
            title="Manually place specific participants into specific cells"
          >
            Load Selected Participants
          </Button>

          {filledCount > 0 && (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 size-4" />
              Print ({filledCount} · {sheetCount} sheet
              {sheetCount !== 1 ? "s" : ""})
            </Button>
          )}
        </div>

        {/* Manual cell assignment panel */}
        {manualMode && (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Manual cell assignment — {filledCount}/{BADGES_PER_SHEET} filled
              </span>
              <Button variant="ghost" size="sm" onClick={clearAssignments}>
                Clear all
              </Button>
            </div>

            {badges.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {loading ? "Loading participants…" : "No participants found."}
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {assignments.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">
                      Cell {i + 1}
                    </span>
                    <div className="flex-1">
                      <ParticipantPicker
                        pool={badges}
                        value={b}
                        onSelect={(x) => assignCell(i, x)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Search by name, church, participant code, or confirmation code.
              Cells map left-to-right, top-to-bottom on the printed sheet.
            </p>
          </div>
        )}

        {/* Layout options + calibration */}
        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
            />
            <Grid3x3 className="size-3.5" /> Grid lines
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={calibrate}
              onChange={(e) => setCalibrate(e.target.checked)}
            />
            Calibration mode (empty grid)
          </label>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Scale</span>
            <input
              type="range"
              min={94}
              max={106}
              step={0.25}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-32"
            />
            <span className="w-12 tabular-nums">{scale}%</span>
          </div>
          <NudgeControl label="X" value={offsetX} onChange={setOffsetX} />
          <NudgeControl label="Y" value={offsetY} onChange={setOffsetY} />
          <Button variant="ghost" size="sm" onClick={resetCalibration}>
            <RotateCcw className="mr-1 size-3.5" /> Reset
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Print tip: in the browser dialog set <strong>Scale 100%</strong>,{" "}
          <strong>Margins: None</strong>, turn off headers/footers, and use Chrome
          for best alignment. If a printer drifts, run Calibration mode once and
          nudge Scale/X/Y.
        </p>

        {loaded && !manualMode && (
          <p className="text-sm text-muted-foreground">
            {badges.length} badge{badges.length !== 1 ? "s" : ""} found
            {onePage && badges.length > bulkBadges.length
              ? ` · showing first ${bulkBadges.length} (1 page)`
              : ""}
          </p>
        )}
      </div>

      {/* Sheets */}
      <LanyardSheets
        badges={renderBadges}
        showGrid={showGrid}
        calibrate={calibrate}
      />
    </div>
  );
}

/* ─── Participant picker (searchable, assigns one badge to a cell) ────────── */

function ParticipantPicker({
  pool,
  value,
  onSelect,
}: {
  pool: Badge[];
  value: Badge | null;
  onSelect: (b: Badge | null) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s ? pool.filter((b) => badgeSearchText(b).includes(s)) : pool;
    return base.slice(0, 12);
  }, [pool, q]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
        <span className="flex-1 truncate" title={badgeLabel(value)}>
          {badgeLabel(value)}
        </span>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => {
            onSelect(null);
            setQ("");
          }}
          title="Clear"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search participant…"
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover py-1 shadow-md">
          {matches.map((b, i) => (
            <li key={i}>
              <button
                type="button"
                className="block w-full truncate px-2 py-1.5 text-left text-sm hover:bg-accent"
                title={badgeLabel(b)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(b);
                  setOpen(false);
                  setQ("");
                }}
              >
                {badgeLabel(b)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Small UI helper ────────────────────────────────────────────────────── */

function NudgeControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onChange(Math.round((value - 0.5) * 10) / 10)}
      >
        −
      </Button>
      <span className="w-12 text-center tabular-nums">{value}mm</span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onChange(Math.round((value + 0.5) * 10) / 10)}
      >
        +
      </Button>
    </div>
  );
}
