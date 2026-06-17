"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer, Loader2, Grid3x3, RotateCcw, Key, Users } from "lucide-react";
import { formatRoomsCompact } from "@/lib/print/registration-summary";

/* ─── Types (match /api/admin/print/labels payload) ───────────────────────── */

interface LabelRecord {
  id: string;
  confirmationCode: string | null;
  seqNumber: number | null;
  lastName: string;
  church: string | null;
  keyCount: number;
  hasWillowKey: boolean;
  occupancy: number;
  roomNumbers: string[];
}

interface EventOption {
  id: string;
  name_en: string;
  year: number;
  is_default: boolean;
}

const STATUS_OPTIONS = ["PAID", "APPROVED", "SUBMITTED", "ALL"];

// Avery 8160 — 30 labels per Letter sheet (3 columns × 10 rows).
const LABELS_PER_SHEET = 30;

/* ─── Print / layout CSS (physical inches → exact Avery 8160 alignment) ───── */

const PRINT_CSS = `
.labels-root { --cal-scale: 1; --cal-x: 0mm; --cal-y: 0mm; }

/* Screen: gray workbench so the white sheets read as paper. */
.labels-workbench {
  background: #6b7280;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  overflow: auto;
}

/* One physical Letter page (portrait). Avery 8160 margins: 0.5in top/bottom,
   0.1875in left/right, 0.125in column gutter, no row gutter. */
.labels-sheet {
  position: relative;
  width: 8.5in;
  height: 11in;
  background: #fff;
  box-sizing: border-box;
  padding: 0.5in 0.1875in;
  display: grid;
  grid-template-columns: repeat(3, 2.625in);
  grid-auto-rows: 1in;
  column-gap: 0.125in;
  row-gap: 0;
  box-shadow: 0 2px 12px rgba(0,0,0,0.35);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Calibration transform is applied ONLY when the user actually nudges scale/offset.
   Safari renders a transformed element at screen resolution when printing and
   breaks pagination (content zooms and spills across many pages), so at the
   default 100%/0/0 we must leave the sheet untransformed. */
.labels-calibrated .labels-sheet {
  transform: scale(var(--cal-scale)) translate(var(--cal-x), var(--cal-y));
  transform-origin: top left;
}

/* One 8160 cell. */
.labels-cell {
  position: relative;
  width: 2.625in;
  height: 1in;
  overflow: hidden;
}
.labels-cell.bordered { outline: 0.5pt solid #94a3b8; outline-offset: -0.5pt; }

.lbl-badge {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 0.07in 0.12in;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #0f172a;
  overflow: hidden;
  font-family: ui-sans-serif, system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
}

/* Top row: registration code (large) + room number. */
.lbl-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.08in;
}
.lbl-code {
  font-family: ui-monospace, monospace;
  font-size: 15pt;
  letter-spacing: -0.02em;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Prefix (e.g. R26LEE) recedes; the trailing sequence (e.g. 0005) is emphasized
   so staff read the registration number at a glance. */
.lbl-code-prefix { font-weight: 600; color: #94a3b8; }
.lbl-code-num { font-weight: 800; color: #0f172a; }
.lbl-room {
  flex: 0 0 auto;
  font-family: ui-monospace, monospace;
  font-size: 11pt;
  font-weight: 700;
  color: #0f172a;
  line-height: 1;
  white-space: nowrap;
}

/* Middle row: last name + key/occupancy chips. */
.lbl-mid {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.08in;
}
.lbl-name {
  font-size: 12pt;
  font-weight: 700;
  line-height: 1.05;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lbl-meta {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.1in;
  font-size: 9.5pt;
  font-weight: 700;
  color: #334155;
}
.lbl-chip { display: flex; align-items: center; gap: 2px; line-height: 1; }
.lbl-chip svg { flex: 0 0 auto; }

/* Bottom row: church. */
.lbl-church {
  font-size: 8pt;
  font-weight: 500;
  color: #64748b;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media print {
  @page { size: letter portrait; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .labels-no-print { display: none !important; }
  .labels-workbench { background: #fff !important; padding: 0 !important; gap: 0 !important; display: block !important; }
  .labels-sheet { box-shadow: none !important; margin: 0 !important; break-after: page; page-break-after: always; }
  .labels-sheet:last-child { break-after: auto; page-break-after: auto; }
}
`;

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function PrintLabelsPage() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState("");
  // Room/key labels are a check-in artifact — default to every attendee who is
  // coming (PAID + APPROVED + SUBMITTED), like the lanyard page, not just PAID.
  const [status, setStatus] = useState("ALL");
  const [labels, setLabels] = useState<LabelRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Layout + print calibration (persisted per browser/printer).
  const [showGrid, setShowGrid] = useState(false);
  const [startOffset, setStartOffset] = useState(0); // skip N cells on the first sheet
  const [scale, setScale] = useState(100); // percent
  const [offsetX, setOffsetX] = useState(0); // mm
  const [offsetY, setOffsetY] = useState(0); // mm

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("eckcm_events")
        .select("id, name_en, year, is_default")
        .order("is_default", { ascending: false })
        .order("year", { ascending: false });
      if (data && data.length > 0) {
        setEvents(data);
        setEventId((data.find((e) => e.is_default) ?? data[0]).id);
      }
    })();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("labels-calibration");
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
      "labels-calibration",
      JSON.stringify({ scale, offsetX, offsetY })
    );
  }, [scale, offsetX, offsetY]);

  const resetCalibration = () => {
    setScale(100);
    setOffsetX(0);
    setOffsetY(0);
  };

  const loadLabels = async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/print/labels?eventId=${eventId}&status=${status}`
      );
      const data = await res.json();
      if (!res.ok) {
        // Surface the failure instead of silently rendering an empty sheet.
        setError(data?.error || `Request failed (${res.status})`);
        setLabels([]);
      } else {
        setLabels(data.labels ?? []);
      }
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load labels");
      setLabels([]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  // Pad the front with blank cells so reprints can start on a partially-used sheet.
  const clampedOffset = Math.max(0, Math.min(startOffset, LABELS_PER_SHEET - 1));
  const cells: (LabelRecord | null)[] = [
    ...Array.from({ length: clampedOffset }, () => null),
    ...labels,
  ];
  const sheets = chunk(cells, LABELS_PER_SHEET);

  const rootStyle = {
    ["--cal-scale" as string]: String(scale / 100),
    ["--cal-x" as string]: `${offsetX}mm`,
    ["--cal-y" as string]: `${offsetY}mm`,
  } as React.CSSProperties;

  // Only attach the calibration transform when it differs from the default —
  // a transformed sheet zooms and breaks pagination when printing from Safari.
  const isCalibrated = scale !== 100 || offsetX !== 0 || offsetY !== 0;

  return (
    <div
      className={`labels-root flex flex-col${isCalibrated ? " labels-calibrated" : ""}`}
      style={rootStyle}
    >
      <style>{PRINT_CSS}</style>

      {/* Header */}
      <div className="labels-no-print flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Print Registration Labels</h1>
        <span className="text-xs text-muted-foreground">
          Avery 8160 · 30 per sheet · 2.625&quot; × 1&quot; · for registration envelopes
        </span>
      </div>

      {/* Controls */}
      <div className="labels-no-print space-y-4 p-6">
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

          <Button onClick={loadLabels} disabled={loading || !eventId}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Load Labels
          </Button>

          {labels.length > 0 && (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 size-4" />
              Print ({labels.length} · {sheets.length} sheet
              {sheets.length !== 1 ? "s" : ""})
            </Button>
          )}
        </div>

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

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Start at label #</span>
            <input
              type="number"
              min={1}
              max={LABELS_PER_SHEET}
              value={clampedOffset + 1}
              onChange={(e) => setStartOffset(Number(e.target.value) - 1)}
              className="w-16 rounded-md border bg-background px-2 py-1 tabular-nums"
            />
            <span className="text-muted-foreground">(skip used cells)</span>
          </div>

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
          <strong>Margins: None</strong>, <strong>Letter</strong>, turn off
          headers/footers, and use Chrome for best alignment. If a printer drifts,
          nudge Scale/X/Y. Each label = one registration; multi-room registrations
          sum keys/people and list every room.
        </p>

        {error && (
          <p className="text-sm font-medium text-destructive">
            Could not load labels: {error}
          </p>
        )}

        {loaded && !error && (
          <p className="text-sm text-muted-foreground">
            {labels.length} label{labels.length !== 1 ? "s" : ""} found
            {labels.length === 0
              ? ` — no ${status === "ALL" ? "active" : status} registrations for this event. Try a different status.`
              : ""}
          </p>
        )}
      </div>

      {/* Sheets */}
      <div className="labels-workbench">
        {sheets.map((sheet, si) => (
          <div key={si} className="labels-sheet">
            {Array.from({ length: LABELS_PER_SHEET }, (_, ci) => {
              const rec = sheet[ci] ?? null;
              return (
                <div
                  key={ci}
                  className={`labels-cell ${showGrid ? "bordered" : ""}`}
                >
                  {rec ? <LabelBadge rec={rec} /> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── One label ────────────────────────────────────────────────────────────── */

/** Render a confirmation code with its trailing number bold/dark and the
 *  alphanumeric prefix faint (e.g. R26LEE0005 → faint "R26LEE" + bold "0005"). */
function CodeText({ code }: { code: string }) {
  const m = code.match(/^(.*\D)(\d+)$/);
  if (!m) return <span className="lbl-code-num">{code}</span>;
  return (
    <>
      <span className="lbl-code-prefix">{m[1]}</span>
      <span className="lbl-code-num">{m[2]}</span>
    </>
  );
}

function LabelBadge({ rec }: { rec: LabelRecord }) {
  // Keys: numeric for normal lodging, "W" for Willow-only, "2+W" when both.
  const keyText = rec.hasWillowKey
    ? rec.keyCount > 0
      ? `${rec.keyCount}+W`
      : "W"
    : String(rec.keyCount);

  return (
    <div className="lbl-badge">
      <div className="lbl-top">
        <span className="lbl-code">
          <CodeText code={rec.confirmationCode ?? "—"} />
        </span>
        <span className="lbl-room" title={rec.roomNumbers.join(", ")}>
          {formatRoomsCompact(rec.roomNumbers)}
        </span>
      </div>

      <div className="lbl-mid">
        <span className="lbl-name">{rec.lastName}</span>
        <span className="lbl-meta">
          <span className="lbl-chip" title="Keys">
            <Key size={11} /> {keyText}
          </span>
          <span className="lbl-chip" title="People in room">
            <Users size={11} /> {rec.occupancy}
          </span>
        </span>
      </div>

      <div className="lbl-church">{rec.church ?? " "}</div>
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

/* ─── utils ──────────────────────────────────────────────────────────────── */

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
