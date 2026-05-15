"use client";

import { useState } from "react";
import type { FloorPlanGrid } from "@/lib/floorplan/excel-to-grid";

const PADDING_X = 24;
const PADDING_TOP = 56;
const PADDING_BOTTOM = 24;
const MIN_SVG_WIDTH = 1280;

type RoomMeta = {
  id: string;
  number: string;
  variant: "regular" | "ada" | "apartment" | "unavailable";
  x: number;
  y: number;
  width: number;
  height: number;
  section: string;
};

function classifyRoom(text: string, neighborText: string | undefined): RoomMeta["variant"] {
  if (/apartment/i.test(neighborText ?? "")) return "apartment";
  if (/ada/i.test(neighborText ?? "")) return "ada";
  return "regular";
}

function buildRooms(grid: FloorPlanGrid): RoomMeta[] {
  // Determine each room's section by its row position.
  const sortedSections = [...grid.sections].sort((a, b) => a.row - b.row);
  const sectionFor = (row: number): string => {
    let label = "";
    for (const s of sortedSections) {
      if (row >= s.row) label = s.label;
    }
    return label;
  };

  const labels = grid.cells.filter((c) => c.kind === "label");
  const rooms = grid.cells.filter((c) => c.kind === "room");

  return rooms.map<RoomMeta>((c) => {
    // Look for a contextual label nearby (same row, ±2 cols) to detect ADA / Apartment / Unavailable.
    const nearby = labels.find(
      (l) => Math.abs(l.row - c.row) <= 5 && Math.abs(l.col - c.col) <= 2 && /ada|apartment/i.test(l.text),
    );
    return {
      id: `room-${c.text}-${c.row}-${c.col}`,
      number: c.text,
      variant: classifyRoom(c.text, nearby?.text),
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      section: sectionFor(c.row),
    };
  });
}

export function FloorPlanSVG({ grid }: { grid: FloorPlanGrid }) {
  const [selected, setSelected] = useState<RoomMeta | null>(null);
  const rooms = buildRooms(grid);

  const innerWidth = grid.totalWidth;
  const innerHeight = grid.totalHeight;
  const svgWidth = innerWidth + PADDING_X * 2;
  const svgHeight = innerHeight + PADDING_TOP + PADDING_BOTTOM;

  return (
    <div className="space-y-3">
      <div className="overflow-auto rounded-2xl border bg-white shadow-sm">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label={`${grid.building} floor plan`}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block", width: "100%", minWidth: MIN_SVG_WIDTH, height: "auto" }}
        >
          <defs>
            <style>{`
              .fp-title { font: 800 24px system-ui, -apple-system, "Segoe UI", sans-serif; fill:#111827; }
              .fp-subtitle { font: 14px system-ui, -apple-system, "Segoe UI", sans-serif; fill:#6b7280; }
              .fp-section { font: 700 18px system-ui, -apple-system, "Segoe UI", sans-serif; fill:#0f172a; }
              .fp-room-label { font: 800 16px system-ui, -apple-system, "Segoe UI", sans-serif; fill:#111827; pointer-events:none; }
              .fp-label { font: 600 11px system-ui, -apple-system, "Segoe UI", sans-serif; fill:#475569; pointer-events:none; }
              .fp-band { fill:#f8fafc; }
              .fp-band-alt { fill:#ffffff; }
              .fp-section-line { stroke:#e2e8f0; stroke-width:1; }
              .fp-room { fill:#f8fafc; stroke:#64748b; stroke-width:2; cursor:pointer; transition: fill .15s, stroke .15s; }
              .fp-room.ada { fill:#dbeafe; stroke:#2563eb; }
              .fp-room.apartment { fill:#f5f3ff; stroke:#7c3aed; }
              .fp-room.unavailable { fill:#fee2e2; stroke:#dc2626; }
              .fp-room:hover { fill:#dcfce7; stroke:#16a34a; stroke-width:3; }
              .fp-room.selected { fill:#bbf7d0; stroke:#15803d; stroke-width:4; }
              .fp-info { fill:#f1f5f9; stroke:#cbd5e1; }
            `}</style>
          </defs>

          <text x={svgWidth / 2} y={28} textAnchor="middle" className="fp-title">
            {grid.sheetName}
          </text>
          <text x={svgWidth / 2} y={48} textAnchor="middle" className="fp-subtitle">
            Schematic floor plan generated from Excel · click a room to select
          </text>

          {/* Section bands */}
          {grid.sections.map((s, i) => {
            const next = grid.sections[i + 1];
            const top = s.y + PADDING_TOP;
            const bottom = next ? next.y + PADDING_TOP : innerHeight + PADDING_TOP;
            return (
              <g key={`band-${s.row}`}>
                <rect
                  x={PADDING_X}
                  y={top}
                  width={innerWidth}
                  height={bottom - top}
                  rx={14}
                  className={i % 2 === 0 ? "fp-band" : "fp-band-alt"}
                />
                <line
                  x1={PADDING_X}
                  x2={PADDING_X + innerWidth}
                  y1={top}
                  y2={top}
                  className="fp-section-line"
                />
                <text x={PADDING_X + 16} y={top + 24} className="fp-section">
                  {s.label}
                </text>
              </g>
            );
          })}

          {/* Non-room labels (a., b., stairs, ADA Room, etc.) */}
          {grid.cells
            .filter((c) => c.kind === "label")
            .map((c) => (
              <text
                key={`label-${c.row}-${c.col}`}
                x={c.x + PADDING_X + c.width / 2}
                y={c.y + PADDING_TOP + c.height / 2}
                textAnchor="middle"
                dominantBaseline="central"
                className="fp-label"
              >
                {c.text.length > 30 ? c.text.slice(0, 28) + "…" : c.text}
              </text>
            ))}

          {/* Rooms */}
          {rooms.map((room) => {
            const isSelected = selected?.id === room.id;
            const cls = ["fp-room", room.variant !== "regular" ? room.variant : "", isSelected ? "selected" : ""]
              .filter(Boolean)
              .join(" ");
            return (
              <g key={room.id} onClick={() => setSelected(room)}>
                <rect
                  x={room.x + PADDING_X + 3}
                  y={room.y + PADDING_TOP + 3}
                  width={Math.max(room.width - 6, 1)}
                  height={Math.max(room.height - 6, 1)}
                  rx={10}
                  className={cls}
                />
                <text
                  x={room.x + PADDING_X + room.width / 2}
                  y={room.y + PADDING_TOP + room.height / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fp-room-label"
                >
                  {room.number}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[260px] rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          {selected ? (
            <>
              Selected: <span className="text-slate-900">Room {selected.number}</span> · {selected.section || "—"} ·{" "}
              <span className="capitalize">{selected.variant}</span>
            </>
          ) : (
            <span className="text-slate-500 font-normal">No room selected. Click any room above.</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
        >
          Clear selection
        </button>
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  const items: { variant: RoomMeta["variant"] | "section"; label: string }[] = [
    { variant: "regular", label: "Regular" },
    { variant: "ada", label: "ADA" },
    { variant: "apartment", label: "Apartment" },
    { variant: "unavailable", label: "Unavailable" },
  ];
  const styleFor = (v: RoomMeta["variant"]): React.CSSProperties => {
    switch (v) {
      case "ada":
        return { background: "#dbeafe", borderColor: "#2563eb" };
      case "apartment":
        return { background: "#f5f3ff", borderColor: "#7c3aed" };
      case "unavailable":
        return { background: "#fee2e2", borderColor: "#dc2626" };
      default:
        return { background: "#f8fafc", borderColor: "#64748b" };
    }
  };
  return (
    <div className="flex flex-wrap gap-4 text-xs text-slate-600">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-6 rounded-md border-2"
            style={styleFor(it.variant as RoomMeta["variant"])}
          />
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
