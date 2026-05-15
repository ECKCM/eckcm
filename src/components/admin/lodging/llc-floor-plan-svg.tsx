"use client";

import { useState } from "react";

type RoomVariant = "regular" | "ada" | "apartment" | "unavailable";

interface Room {
  number: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  variant?: RoomVariant;
  wing: "left-wing" | "left-center" | "right-center" | "right-wing" | "left-apartment" | "right-apartment";
  type: "double" | "apartment";
}

const ROOM_W = 58;
const ROOM_H = 82;
const TOP_Y = 170;
const BOT_Y = 330;

// Coordinates copied verbatim from llc-floor-plan-demo-v2.html.
const ROOMS: Room[] = [
  // Left wing — top row (odd)
  { number: "101", x: 80, y: TOP_Y, wing: "left-wing", type: "double" },
  { number: "103", x: 148, y: TOP_Y, wing: "left-wing", type: "double", variant: "unavailable" },
  { number: "105", x: 216, y: TOP_Y, wing: "left-wing", type: "double" },
  { number: "107", x: 284, y: TOP_Y, wing: "left-wing", type: "double" },
  { number: "109", x: 352, y: TOP_Y, wing: "left-wing", type: "double" },
  { number: "111", x: 420, y: TOP_Y, wing: "left-wing", type: "double" },
  { number: "113", x: 488, y: TOP_Y, wing: "left-wing", type: "double" },
  // Left wing — bottom row (even)
  { number: "102", x: 80, y: BOT_Y, wing: "left-wing", type: "double" },
  { number: "104", x: 148, y: BOT_Y, wing: "left-wing", type: "double" },
  { number: "106", x: 216, y: BOT_Y, wing: "left-wing", type: "double" },
  { number: "108", x: 284, y: BOT_Y, wing: "left-wing", type: "double" },
  { number: "110", x: 352, y: BOT_Y, wing: "left-wing", type: "double" },
  { number: "112", x: 420, y: BOT_Y, wing: "left-wing", type: "double" },
  { number: "114", x: 488, y: BOT_Y, wing: "left-wing", type: "double" },
  // Left center — top row (odd)
  { number: "117", x: 641, y: TOP_Y, wing: "left-center", type: "double" },
  { number: "119", x: 709, y: TOP_Y, wing: "left-center", type: "double" },
  { number: "121", x: 777, y: TOP_Y, wing: "left-center", type: "double" },
  { number: "123", x: 845, y: TOP_Y, wing: "left-center", type: "double" },
  { number: "125", x: 913, y: TOP_Y, wing: "left-center", type: "double" },
  { number: "127", x: 981, y: TOP_Y, wing: "left-center", type: "double" },
  { number: "129", x: 1049, y: TOP_Y, wing: "left-center", type: "double" },
  { number: "131", x: 1117, y: TOP_Y, wing: "left-center", type: "double" },
  { number: "133", x: 1185, y: TOP_Y, wing: "left-center", type: "double", variant: "ada" },
  // Left center — bottom row (even)
  { number: "116", x: 641, y: BOT_Y, wing: "left-center", type: "double" },
  { number: "118", x: 709, y: BOT_Y, wing: "left-center", type: "double" },
  { number: "120", x: 777, y: BOT_Y, wing: "left-center", type: "double" },
  { number: "122", x: 845, y: BOT_Y, wing: "left-center", type: "double" },
  { number: "124", x: 913, y: BOT_Y, wing: "left-center", type: "double" },
  { number: "126", x: 981, y: BOT_Y, wing: "left-center", type: "double" },
  { number: "128", x: 1049, y: BOT_Y, wing: "left-center", type: "double" },
  { number: "130", x: 1117, y: BOT_Y, wing: "left-center", type: "double" },
  { number: "132", x: 1185, y: BOT_Y, wing: "left-center", type: "double", variant: "ada" },
  // Right center — top row (odd)
  { number: "137", x: 1683, y: TOP_Y, wing: "right-center", type: "double", variant: "ada" },
  { number: "139", x: 1751, y: TOP_Y, wing: "right-center", type: "double" },
  { number: "141", x: 1819, y: TOP_Y, wing: "right-center", type: "double" },
  { number: "143", x: 1887, y: TOP_Y, wing: "right-center", type: "double" },
  { number: "145", x: 1955, y: TOP_Y, wing: "right-center", type: "double" },
  { number: "147", x: 2023, y: TOP_Y, wing: "right-center", type: "double" },
  { number: "149", x: 2091, y: TOP_Y, wing: "right-center", type: "double" },
  { number: "151", x: 2159, y: TOP_Y, wing: "right-center", type: "double" },
  { number: "153", x: 2227, y: TOP_Y, wing: "right-center", type: "double" },
  // Right center — bottom row (even)
  { number: "136", x: 1683, y: BOT_Y, wing: "right-center", type: "double", variant: "ada" },
  { number: "138", x: 1751, y: BOT_Y, wing: "right-center", type: "double" },
  { number: "140", x: 1819, y: BOT_Y, wing: "right-center", type: "double" },
  { number: "142", x: 1887, y: BOT_Y, wing: "right-center", type: "double" },
  { number: "144", x: 1955, y: BOT_Y, wing: "right-center", type: "double" },
  { number: "146", x: 2023, y: BOT_Y, wing: "right-center", type: "double" },
  { number: "148", x: 2091, y: BOT_Y, wing: "right-center", type: "double" },
  { number: "150", x: 2159, y: BOT_Y, wing: "right-center", type: "double" },
  { number: "152", x: 2227, y: BOT_Y, wing: "right-center", type: "double" },
  // Right wing — top row (odd)
  { number: "157", x: 2380, y: TOP_Y, wing: "right-wing", type: "double" },
  { number: "159", x: 2448, y: TOP_Y, wing: "right-wing", type: "double" },
  { number: "161", x: 2516, y: TOP_Y, wing: "right-wing", type: "double" },
  { number: "163", x: 2584, y: TOP_Y, wing: "right-wing", type: "double" },
  { number: "165", x: 2652, y: TOP_Y, wing: "right-wing", type: "double" },
  { number: "167", x: 2720, y: TOP_Y, wing: "right-wing", type: "double" },
  { number: "169", x: 2788, y: TOP_Y, wing: "right-wing", type: "double" },
  // Right wing — bottom row (even)
  { number: "156", x: 2380, y: BOT_Y, wing: "right-wing", type: "double" },
  { number: "158", x: 2448, y: BOT_Y, wing: "right-wing", type: "double" },
  { number: "160", x: 2516, y: BOT_Y, wing: "right-wing", type: "double" },
  { number: "162", x: 2584, y: BOT_Y, wing: "right-wing", type: "double" },
  { number: "164", x: 2652, y: BOT_Y, wing: "right-wing", type: "double" },
  { number: "166", x: 2720, y: BOT_Y, wing: "right-wing", type: "double" },
  { number: "168", x: 2788, y: BOT_Y, wing: "right-wing", type: "double" },
  // Apartment caps
  { number: "100", x: 16, y: BOT_Y, width: 50, wing: "left-apartment", type: "apartment", variant: "apartment" },
  { number: "199", x: 2860, y: TOP_Y, width: 50, wing: "right-apartment", type: "apartment", variant: "apartment" },
];

// Native canvas extends to ~2920; padded width keeps the right apartment visible.
const VIEWBOX_W = 2940;
const VIEWBOX_H = 600;
const MIN_SVG_WIDTH = 1280;

export function LLCFloorPlanSVG() {
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const selected = ROOMS.find((r) => r.number === selectedNumber) ?? null;

  return (
    <div className="space-y-3">
      <div className="overflow-auto rounded-2xl border bg-white shadow-sm">
        <svg
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="LLC 1st Floor Schematic"
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block", width: "100%", minWidth: MIN_SVG_WIDTH, height: "auto" }}
        >
          <defs>
            <style>{`
              .llc-title { font: 800 28px system-ui,-apple-system,"Segoe UI",sans-serif; fill:#111827; text-anchor:middle; }
              .llc-subtitle { font: 15px system-ui,-apple-system,"Segoe UI",sans-serif; fill:#6b7280; text-anchor:middle; }
              .llc-section-label { font: 13px system-ui,-apple-system,"Segoe UI",sans-serif; fill:#6b7280; text-anchor:middle; }
              .llc-wall { fill:none; stroke:#1f2937; stroke-width:3; stroke-linecap:round; stroke-linejoin:round; }
              .llc-hall { fill:#ffffff; stroke:#cbd5e1; stroke-width:1.5; }
              .llc-room { fill:#f8fafc; stroke:#64748b; stroke-width:2; cursor:pointer; transition: fill .15s, stroke .15s; }
              .llc-room.ada { fill:#dbeafe; }
              .llc-room.apartment { fill:#f5f3ff; }
              .llc-room.unavailable { fill:#fee2e2; stroke:#dc2626; }
              .llc-room:hover { fill:#dcfce7; stroke:#16a34a; stroke-width:3; }
              .llc-room.selected { fill:#bbf7d0; stroke:#15803d; stroke-width:4; }
              .llc-room-label { font: 800 22px system-ui,-apple-system,"Segoe UI",sans-serif; fill:#111827; pointer-events:none; text-anchor:middle; dominant-baseline:middle; }
              .llc-label { font: 700 16px system-ui,-apple-system,"Segoe UI",sans-serif; fill:#111827; pointer-events:none; text-anchor:middle; dominant-baseline:middle; }
              .llc-small { font: 13px system-ui,-apple-system,"Segoe UI",sans-serif; fill:#6b7280; pointer-events:none; text-anchor:middle; dominant-baseline:middle; }
              .llc-marker { fill:#e0f2fe; stroke:#0284c7; stroke-width:2; }
              .llc-stairs { fill:#f8fafc; stroke:#64748b; stroke-width:2; }
              .llc-core { fill:#fef3c7; stroke:#92400e; stroke-width:2; }
            `}</style>
          </defs>

          <text x={VIEWBOX_W / 2} y="36" className="llc-title">
            Living/Learning Center — 1st Floor / Ground Level
          </text>
          <text x={VIEWBOX_W / 2} y="64" className="llc-subtitle">
            Clean schematic SVG · clickable rooms · intentionally not photo-accurate
          </text>

          <text x="313" y="122" className="llc-section-label">
            Left Wing · 14 Doubles / 1 Apt
          </text>
          <text x="942" y="122" className="llc-section-label">
            Left Center · 18 Doubles
          </text>
          <text x="1984" y="122" className="llc-section-label">
            Right Center · 18 Doubles
          </text>
          <text x="2613" y="122" className="llc-section-label">
            Right Wing · 14 Doubles / 1 Apt
          </text>

          {/* Hallway segments */}
          <rect x="16" y="265" width="530" height="54" rx="10" className="llc-hall" />
          <rect x="641" y="265" width="602" height="54" rx="10" className="llc-hall" />
          <rect x="1313" y="235" width="300" height="116" rx="18" className="llc-hall" />
          <rect x="1683" y="265" width="602" height="54" rx="10" className="llc-hall" />
          <rect x="2380" y="265" width="530" height="54" rx="10" className="llc-hall" />
          <path
            d="M551 292 H623 M1251 292 H1313 M1613 292 H1675 M2303 292 H2375"
            className="llc-wall"
          />

          {/* Stairs / elevators */}
          <g aria-label="left stairs">
            <polygon points="571,278 624,238 624,318" className="llc-stairs" />
            <text x="598" y="337" className="llc-small">
              Stairs
            </text>
          </g>
          <g aria-label="left elevator">
            <rect x="561" y="232" width="62" height="106" rx="10" className="llc-marker" />
            <text x="592" y="285" className="llc-label">
              Elev.
            </text>
          </g>
          <g aria-label="right elevator">
            <rect x="2303" y="232" width="62" height="106" rx="10" className="llc-marker" />
            <text x="2334" y="285" className="llc-label">
              Elev.
            </text>
          </g>

          {/* Central core */}
          <rect x="1347" y="170" width="88" height="70" rx="10" className="llc-core" />
          <text x="1391" y="194" className="llc-small">
            Activity
          </text>
          <text x="1391" y="214" className="llc-small">
            Room
          </text>
          <rect x="1491" y="170" width="88" height="70" rx="10" className="llc-core" />
          <text x="1535" y="194" className="llc-small">
            Service
          </text>
          <text x="1535" y="214" className="llc-small">
            Core
          </text>
          <rect x="1398" y="365" width="130" height="58" rx="10" className="llc-core" />
          <text x="1463" y="394" className="llc-label">
            Main Lobby
          </text>
          <rect x="1423" y="258" width="80" height="56" rx="8" className="llc-marker" />
          <text x="1463" y="286" className="llc-label">
            Elev.
          </text>
          <text x="1463" y="143" className="llc-small">
            Exterior Access / Key Room
          </text>
          <text x="1328" y="170" className="llc-label">
            ♿
          </text>
          <text x="1598" y="170" className="llc-label">
            ♿
          </text>
          <text x="1463" y="462" className="llc-small">
            Parking / Main Lobby ↓
          </text>

          {/* Rooms */}
          {ROOMS.map((room) => {
            const w = room.width ?? ROOM_W;
            const h = room.height ?? ROOM_H;
            const isSelected = selectedNumber === room.number;
            const cls = ["llc-room", room.variant ?? "", isSelected ? "selected" : ""].filter(Boolean).join(" ");
            return (
              <g
                key={room.number}
                onClick={() => setSelectedNumber(room.number)}
                style={{ cursor: "pointer" }}
              >
                <rect x={room.x} y={room.y} width={w} height={h} rx={8} className={cls} />
                <text x={room.x + w / 2} y={room.y + h / 2} className="llc-room-label">
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
              Selected: <span className="text-slate-900">Room {selected.number}</span> · Floor 1 · {selected.wing} ·{" "}
              <span className="capitalize">{selected.type}</span>
              {selected.variant && selected.variant !== "regular" ? (
                <>
                  {" "}
                  · <span className="capitalize">{selected.variant}</span>
                </>
              ) : null}
            </>
          ) : (
            <span className="text-slate-500 font-normal">No room selected. Click any room above.</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSelectedNumber(null)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
        >
          Clear selection
        </button>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        <LegendSwatch label="Regular" bg="#f8fafc" border="#64748b" />
        <LegendSwatch label="ADA" bg="#dbeafe" border="#64748b" />
        <LegendSwatch label="Apartment" bg="#f5f3ff" border="#64748b" />
        <LegendSwatch label="Unavailable" bg="#fee2e2" border="#dc2626" />
      </div>
    </div>
  );
}

function LegendSwatch({ label, bg, border }: { label: string; bg: string; border: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-4 w-6 rounded-md border-2"
        style={{ background: bg, borderColor: border }}
      />
      <span>{label}</span>
    </div>
  );
}
