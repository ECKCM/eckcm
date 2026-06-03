"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { TitleIcon } from "@/components/admin/title-icons";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface EventOption {
  id: string;
  name_en: string;
  year: number;
  is_default: boolean;
}

export interface EventMeta {
  nameEn: string;
  nameKo: string | null;
  year: number | null;
}

export interface Badge {
  nameEn: string;
  nameKo: string | null;
  church: string | null;
  groupCode: string | null;
  title: { name: string; color: string | null; icon: string | null } | null;
  role: string;
  confirmationCode: string | null;
  participantCode: string | null;
  qrValue: string | null;
}

export const STATUS_OPTIONS = ["PAID", "APPROVED", "SUBMITTED", "ALL"];

// Avery 5390 — 8 badges per Letter sheet (2 columns × 4 rows).
export const BADGES_PER_SHEET = 8;

// Fixed event header printed on every badge. Edit these two lines per year.
export const HEADER_EN = "East Coast Korean Camp meeting 2026";
export const HEADER_KO = "제47 회 중동부 연합 야영회";

/* ─── Print / layout CSS (physical inches → exact 5390 alignment) ─────────── */

export const PRINT_CSS = `
.lanyard-root { --cal-scale: 1; --cal-x: 0mm; --cal-y: 0mm; }

/* Screen: gray workbench so white sheets read as paper. */
.lanyard-workbench {
  background: #6b7280;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  overflow: auto;
}

/* One physical Letter page. */
.lanyard-sheet {
  position: relative;
  width: 8.5in;
  height: 11in;
  background: #fff;
  box-sizing: border-box;
  /* Avery 5390 margins: 1in top/bottom, 0.75in left/right, no gutter. */
  padding: 1in 0.75in;
  display: grid;
  grid-template-columns: repeat(2, 3.5in);
  grid-auto-rows: 2.25in;
  gap: 0;
  box-shadow: 0 2px 12px rgba(0,0,0,0.35);
  transform: scale(var(--cal-scale)) translate(var(--cal-x), var(--cal-y));
  transform-origin: top left;
}

/* One 5390 cell (landscape). */
.lanyard-cell {
  position: relative;
  width: 3.5in;
  height: 2.25in;
  overflow: hidden;
}
.lanyard-cell.bordered { outline: 0.5pt solid #94a3b8; outline-offset: -0.5pt; }

/* The badge fills the landscape cell. QR + codes stay upright; the
   name/title/church/event read vertically (sideways) so the badge reads
   correctly when the lanyard hangs portrait. */
.lanyard-badge {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 0.1in 0.14in;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: space-between;
  gap: 0.06in;
  color: #0f172a;
  font-family: ui-sans-serif, system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
}

.lan-qrcol {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
}
.lan-code {
  font-size: 7.5pt;
  font-family: ui-monospace, monospace;
  font-weight: 600;
  color: #334155;
  letter-spacing: 0.02em;
  line-height: 1.2;
}
.lan-qr {
  display: flex; align-items: center; justify-content: center;
  /* Rotate ONLY the QR so it stands upright when the lanyard is worn vertically. */
  transform: rotate(90deg);
}
.lan-qr-empty {
  width: 1.45in; height: 1.45in;
  border: 1px dashed #cbd5e1; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  font-size: 7pt; color: #94a3b8;
}

/* Three sections across the landscape cell (right to left = worn top to bottom):
   QR (bottom) · middle name block (centered, dynamic) · event header (top). */
.lan-mid {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 0.05in;
}
.lan-v {
  writing-mode: vertical-rl;
  text-orientation: sideways;
  text-align: center;
  line-height: 1.1;
  word-break: keep-all;
  max-height: 100%;
}
.lan-name { font-size: 19pt; font-weight: 800; color: #000000; }
.lan-title {
  font-size: 9pt;
  font-weight: 700;
  color: #ffffff;
  background: #334155;          /* default; overridden by the title's color */
  border-radius: 999px;
  padding: 4pt 3pt;
  line-height: 1;
  /* Flex so the icon + label stay centered on the same line (cross axis). */
  display: flex;
  align-items: center;
  justify-content: center;
  /* Ensure the colored pill actually prints (browsers drop backgrounds otherwise). */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
/* Rotate the icon to match the sideways title text; small gap before the label
   (inline-end = the reading direction in vertical-rl). */
.lan-title svg { transform: rotate(90deg); margin-inline-end: 3pt; flex: 0 0 auto; }
.lan-church { font-size: 9.5pt; font-weight: 500; color: #334155; }
.lan-ev {
  flex: 0 0 auto;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.02in;
}
.lan-ev-en { font-size: 5.5pt; font-weight: 600; color: #64748b; }
.lan-ev-ko { font-size: 8pt; font-weight: 700; color: #0f172a; }

@media print {
  @page { size: letter portrait; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .lanyard-no-print { display: none !important; }
  .lanyard-workbench { background: #fff !important; padding: 0 !important; gap: 0 !important; display: block !important; }
  .lanyard-sheet { box-shadow: none !important; margin: 0 !important; break-after: page; page-break-after: always; }
  .lanyard-sheet:last-child { break-after: auto; page-break-after: auto; }
}
`;

/* ─── Badge ──────────────────────────────────────────────────────────────── */

export function LanyardBadge({ badge }: { badge: Badge }) {
  const displayName = badge.nameKo || badge.nameEn;

  return (
    <div className="lanyard-badge">
      {/* QR column — upright */}
      <div className="lan-qrcol">
        <div className="lan-code">{badge.confirmationCode ?? " "}</div>
        <div className="lan-qr">
          {badge.qrValue ? (
            <QRCodeSVG
              value={badge.qrValue}
              size={138}
              level="M"
              fgColor="#000000"
              bgColor="#ffffff"
            />
          ) : (
            <div className="lan-qr-empty">No code</div>
          )}
        </div>
        <div className="lan-code">{badge.participantCode ?? " "}</div>
      </div>

      {/* Middle section — name / title / church. Centered and dynamic so long
          values can wrap to extra columns. Read right-to-left: name, title,
          church (so physical order is church, title, name). */}
      <div className="lan-mid">
        {badge.church && <div className="lan-v lan-church">{badge.church}</div>}
        {badge.title && (
          <div
            className="lan-v lan-title"
            style={
              badge.title.color ? { backgroundColor: badge.title.color } : undefined
            }
          >
            <TitleIcon name={badge.title.icon} size={11} />
            {badge.title.name}
          </div>
        )}
        <div className="lan-v lan-name">{displayName}</div>
      </div>

      {/* Top section (worn) — event header, far right. */}
      <div className="lan-ev">
        <div className="lan-v lan-ev-ko">{HEADER_KO}</div>
        <div className="lan-v lan-ev-en">{HEADER_EN}</div>
      </div>
    </div>
  );
}

/* ─── Sheets renderer ────────────────────────────────────────────────────── */

export function LanyardSheets({
  badges,
  showGrid,
  calibrate,
}: {
  // Entries may be null to leave a cell blank (manual cell assignment mode).
  badges: (Badge | null)[];
  showGrid: boolean;
  calibrate: boolean;
}) {
  const sheets: (Badge | null)[][] = calibrate
    ? [Array.from({ length: BADGES_PER_SHEET }, () => null)]
    : chunk(badges, BADGES_PER_SHEET);

  return (
    <div className="lanyard-workbench">
      {sheets.map((sheet, si) => (
        <div key={si} className="lanyard-sheet">
          {Array.from({ length: BADGES_PER_SHEET }, (_, ci) => {
            const badge = sheet[ci] ?? null;
            return (
              <div key={ci} className={`lanyard-cell ${showGrid ? "bordered" : ""}`}>
                {badge ? (
                  <LanyardBadge badge={badge} />
                ) : calibrate ? (
                  <div className="lanyard-badge">
                    <div className="lan-code">
                      CELL {si * BADGES_PER_SHEET + ci + 1}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ─── Data hook (shared by main + test pages) ────────────────────────────── */

export function useLanyardData() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState("");
  const [status, setStatus] = useState("PAID");
  const [event, setEvent] = useState<EventMeta | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

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

  const loadBadges = useCallback(
    async (overrideStatus?: string) => {
      if (!eventId) return;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/print/lanyard?eventId=${eventId}&status=${overrideStatus ?? status}`
        );
        const data = await res.json();
        setEvent(data.event ?? null);
        setBadges(data.badges ?? []);
        setLoaded(true);
      } catch {
        setBadges([]);
      } finally {
        setLoading(false);
      }
    },
    [eventId, status]
  );

  return {
    events,
    eventId,
    setEventId,
    status,
    setStatus,
    event,
    badges,
    loading,
    loaded,
    loadBadges,
  };
}

/* ─── utils ──────────────────────────────────────────────────────────────── */

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
