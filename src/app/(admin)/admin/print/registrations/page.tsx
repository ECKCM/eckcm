"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer, Loader2 } from "lucide-react";
import { formatStayDates, formatRoomsCompact } from "@/lib/print/registration-summary";

/* ─── Types (match /api/admin/print/registrations payload) ─────────────────── */

interface Title {
  name: string;
  color: string | null;
  icon: string | null;
}

interface Participant {
  name: string;
  nameKo: string | null;
  gender: string;
  age: number | null;
  isK12: boolean;
  grade: string | null;
  stayDates: string;
  meals: string;
  church: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  title: Title | null;
  role: string;
  participantCode: string | null;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: string;
  amount: string;
}

interface RegistrationSummary {
  id: string;
  confirmationCode: string;
  seqNumber: number | null;
  eventName: string;
  startDate: string;
  endDate: string;
  nightsCount: number;
  registrationType: string;
  status: string;
  paymentMethod: string;
  hasAirport: boolean;
  registrationGroup: string | null;
  roomNumbers: string[];
  keyDeposit: string;
  participants: Participant[];
  lineItems: LineItem[];
  total: string;
  additionalRequests: string | null;
}

interface EventOption {
  id: string;
  name_en: string;
  year: number;
  is_default: boolean;
}

const STATUS_OPTIONS = ["PAID", "APPROVED", "SUBMITTED", "ALL"];

const GENDER_SHORT: Record<string, string> = {
  MALE: "M",
  FEMALE: "F",
  NON_BINARY: "NB",
  PREFER_NOT_TO_SAY: "—",
};

/* ─── Print CSS — landscape Letter, one registration per page ──────────────── */

const PRINT_CSS = `
/* Screen: gray workbench so the white sheets read as paper (like the lanyard page). */
.reg-workbench {
  background: #6b7280;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

/* One physical Letter page in landscape. */
.reg-sheet {
  position: relative;
  width: 11in;
  height: 8.5in;
  background: #fff;
  color: #0f172a;
  box-sizing: border-box;
  padding: 0.45in 0.5in;
  box-shadow: 0 2px 12px rgba(0,0,0,0.35);
  display: flex;
  flex-direction: column;
  font-family: ui-sans-serif, system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  font-size: 10.5pt;
  line-height: 1.3;
  overflow: hidden;
  /* Force colors/backgrounds to print instead of dropping to grayscale. */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Header */
.reg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2.5px solid #2563eb;
  padding-bottom: 8px;
}
.reg-head-title { font-size: 17pt; font-weight: 800; letter-spacing: -0.01em; color: #1e3a8a; }
.reg-head-right { display: flex; align-items: center; gap: 24px; }
.reg-hk { display: flex; flex-direction: row; gap: 20px; text-align: left; }
.reg-hk-l { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
.reg-hk-v { font-size: 11pt; font-weight: 700; line-height: 1.15; }
.reg-code { font-family: ui-monospace, monospace; font-size: 16pt; font-weight: 800; color: #2563eb; }
.reg-status {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 8.5pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  border: 1.5px solid #2563eb;
  color: #2563eb;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.reg-status.paid { background: #16a34a; border-color: #16a34a; color: #fff; }

/* Info strip */
.reg-info {
  display: grid;
  /* Event, Dates, Nights, Payment, Type, Reg. Group, Airport.
     Type is short ("Self"/"Others") so it's narrowed; the freed width goes to
     Reg. Group, which holds long group names. Tracks still sum to 7fr so the
     strip's overall width is unchanged. */
  grid-template-columns: 1fr 1fr 1fr 1fr 0.6fr 1.4fr 1fr;
  gap: 6px 14px;
  margin: 10px 0;
}
/* min-width:0 lets each grid cell shrink to its track so long values (e.g. a
   long Reg. Group) can ellipsis instead of wrapping to a new line. */
.reg-info > div { min-width: 0; }
.reg-info .lbl { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
.reg-info .val {
  font-size: 10.5pt;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Section heading */
.reg-section-h {
  font-size: 9pt;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #2563eb;
  margin: 8px 0 4px;
}
/* Participants heading row: title on the left, every participant code listed on
   the right (e.g. "GTR432, HTPERE"). */
.reg-section-h-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.reg-pcodes {
  font-family: ui-monospace, monospace;
  font-size: 8pt;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  color: #334155;
  text-align: right;
  word-break: break-word;
}
/* Pricing-breakdown note: sits right next to the title (left-aligned), always a
   single line, ellipsis when it overflows. min-width:0 lets it shrink inside the
   flex row so the ellipsis kicks in. */
.reg-note {
  flex: 1;
  min-width: 0;
  font-size: 8pt;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  color: #334155;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Tables */
.reg-table { width: 100%; border-collapse: collapse; }
.reg-table th {
  text-align: left;
  font-size: 7.5pt;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  font-weight: 600;
  padding: 3px 6px;
  border-bottom: 1.5px solid #cbd5e1;
}
.reg-table td { padding: 3px 6px; border-bottom: 0.75pt solid #e2e8f0; vertical-align: top; }
.reg-table .num { text-align: right; }
.reg-table .ctr { text-align: center; }
/* Participants table: left columns fit their content on one line; only the
   Department/Church cells are allowed to truncate with an ellipsis. */
.reg-ptable { table-layout: auto; }
.reg-ptable td { white-space: nowrap; }
.reg-ptable .reg-contact { white-space: normal; }
.reg-name { font-weight: 700; }
.reg-rep { color: #2563eb; font-size: 8pt; font-weight: 700; }
.reg-meals { font-size: 9.5pt; }
.reg-trunc {
  display: inline-block;
  max-width: 1.6in;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
  font-size: 9pt;
}
.reg-contact { font-size: 8pt; color: #64748b; padding-top: 0; }

/* Black & white mode — force every glyph to pure black and drop colored fills,
   so a grayscale printer renders cleanly. Toggled via the controls. */
.reg-bw .reg-sheet,
.reg-bw .reg-sheet * { color: #000 !important; }
.reg-bw .reg-head { border-bottom-color: #000 !important; }
.reg-bw .reg-status { background: #fff !important; border-color: #000 !important; }
.reg-bw .reg-table th { border-bottom-color: #000 !important; }
.reg-bw .reg-table tfoot td { border-top-color: #000 !important; }

.reg-pricing-wrap { margin-top: auto; padding-top: 10px; }
.reg-table tfoot td { border-bottom: none; border-top: 1.5px solid #94a3b8; font-weight: 700; padding-top: 5px; }

.reg-foot {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 0.75pt solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  font-size: 7.5pt;
  color: #94a3b8;
}

@media print {
  @page { size: letter landscape; margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .reg-no-print { display: none !important; }
  /* Admin chrome (sidebar + header) is hidden globally by the admin layout's
     print styles, so this page only resets its own workbench. */
  .reg-workbench { background: #fff !important; padding: 0 !important; gap: 0 !important; display: block !important; }
  .reg-sheet { box-shadow: none !important; margin: 0 !important; break-after: page; page-break-after: always; }
  .reg-sheet:last-child { break-after: auto; page-break-after: auto; }
}
`;

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function PrintRegistrationsPage() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState<string>("");
  const [status, setStatus] = useState("ALL");
  const [registrations, setRegistrations] = useState<RegistrationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blackAndWhite, setBlackAndWhite] = useState(false);

  useEffect(() => {
    const loadEvents = async () => {
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
    };
    loadEvents();
  }, []);

  const loadRegistrations = async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/print/registrations?eventId=${eventId}&status=${status}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || `Request failed (${res.status})`);
        setRegistrations([]);
      } else {
        setRegistrations(data.registrations ?? []);
      }
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load registrations");
      setRegistrations([]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col">
      <style>{PRINT_CSS}</style>

      {/* Header — hidden in print */}
      <div className="reg-no-print flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Registration Summaries</h1>
        <span className="text-xs text-muted-foreground">
          Letter · landscape · one registration per page
        </span>
      </div>

      {/* Controls — hidden in print */}
      <div className="reg-no-print space-y-4 p-6">
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

          <Button onClick={loadRegistrations} disabled={loading || !eventId}>
            {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            Load Registrations
          </Button>

          {registrations.length > 0 && (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4 mr-2" />
              Print All ({registrations.length})
            </Button>
          )}

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={blackAndWhite}
              onChange={(e) => setBlackAndWhite(e.target.checked)}
            />
            Black &amp; white (mono printer)
          </label>
        </div>

        {error && (
          <p className="text-sm font-medium text-destructive">
            Could not load registrations: {error}
          </p>
        )}

        {loaded && !error && (
          <p className="text-sm text-muted-foreground">
            {registrations.length} registration
            {registrations.length !== 1 ? "s" : ""} found
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Print tip: in the browser dialog set <strong>Landscape</strong>,{" "}
          <strong>Letter</strong>, <strong>Margins: None</strong>, enable{" "}
          <strong>Background graphics</strong>, and turn off headers/footers.
        </p>
      </div>

      {/* Print area */}
      <div className={`reg-workbench${blackAndWhite ? " reg-bw" : ""}`}>
        {registrations.map((reg) => (
          <RegistrationSheet key={reg.id} reg={reg} />
        ))}
      </div>
    </div>
  );
}

/* ─── One registration sheet ───────────────────────────────────────────────── */

function RegistrationSheet({ reg }: { reg: RegistrationSummary }) {
  return (
    <div className="reg-sheet">
      {/* Header */}
      <div className="reg-head">
        <div className="reg-head-title">ECKCM Registration Summary</div>
        <div className="reg-head-right">
          <span className={`reg-status ${reg.status === "PAID" ? "paid" : ""}`}>
            {reg.status}
          </span>
          <div className="reg-hk">
            <div>
              <div className="reg-hk-l">Room #</div>
              <div className="reg-hk-v" title={reg.roomNumbers.join(", ")}>
                {formatRoomsCompact(reg.roomNumbers)}
              </div>
            </div>
            <div>
              <div className="reg-hk-l">Key Deposit</div>
              <div className="reg-hk-v">{reg.keyDeposit}</div>
            </div>
          </div>
          <div className="reg-code">{reg.confirmationCode}</div>
        </div>
      </div>

      {/* Info strip */}
      <div className="reg-info">
        <Info label="Event" value={reg.eventName} />
        <Info
          label="Dates"
          value={formatStayDates(reg.startDate, reg.endDate)}
        />
        <Info label="Nights" value={String(reg.nightsCount)} />
        <Info label="Payment" value={reg.paymentMethod} />
        <Info
          label="Type"
          value={reg.registrationType === "others" ? "Others" : "Self"}
        />
        <Info label="Reg. Group" value={reg.registrationGroup || "—"} />
        <Info label="Airport" value={reg.hasAirport ? "Yes" : "No"} />
      </div>

      {/* Participants — heading on the left, every participant code on the right */}
      <div className="reg-section-h reg-section-h-row">
        <span>Participants ({reg.participants.length})</span>
        {reg.participants.some((p) => p.participantCode) && (
          <span className="reg-pcodes">
            {reg.participants
              .map((p) => p.participantCode)
              .filter(Boolean)
              .join(", ")}
          </span>
        )}
      </div>
      <table className="reg-table reg-ptable">
        <thead>
          <tr>
            <th className="ctr">#</th>
            <th>Name</th>
            <th className="ctr">Gender</th>
            <th className="ctr">Age</th>
            <th>Stay Dates</th>
            <th>Meals</th>
            <th>Department</th>
            <th>Church</th>
          </tr>
        </thead>
        <tbody>
          {reg.participants.map((p, i) => (
            <ParticipantRows key={i} p={p} index={i + 1} />
          ))}
        </tbody>
      </table>

      {/* Pricing breakdown */}
      {reg.lineItems.length > 0 && (
        <div className="reg-pricing-wrap">
          <div className="reg-section-h reg-section-h-row">
            <span>Pricing Breakdown</span>
            {reg.additionalRequests?.trim() && (
              <span className="reg-note" title={reg.additionalRequests}>
                Additional Requests: {reg.additionalRequests}
              </span>
            )}
          </div>
          <table className="reg-table">
            <thead>
              <tr>
                <th>Description</th>
                <th className="ctr" style={{ width: "0.6in" }}>
                  Qty
                </th>
                <th className="num" style={{ width: "1.2in" }}>
                  Unit Price
                </th>
                <th className="num" style={{ width: "1.2in" }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {reg.lineItems.map((item, i) => (
                <tr key={i}>
                  <td>{item.description}</td>
                  <td className="ctr">{item.quantity}</td>
                  <td className="num">{item.unitPrice}</td>
                  <td className="num">{item.amount}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="num">
                  Total
                </td>
                <td className="num">{reg.total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="reg-foot">
        <span>East Coast Korean Camp Meeting</span>
        <span>{reg.confirmationCode}</span>
      </div>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────────────────────── */

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className="val" title={value}>
        {value}
      </div>
    </div>
  );
}

function ParticipantRows({ p, index }: { p: Participant; index: number }) {
  const age = p.age != null ? String(p.age) : "—";

  const contact = [
    p.email,
    p.phone,
    p.title ? `Title: ${p.title.name}` : null,
    p.guardianName
      ? `Guardian: ${p.guardianName}${
          p.guardianPhone ? ` (${p.guardianPhone})` : ""
        }`
      : null,
  ].filter(Boolean);

  return (
    <>
      <tr>
        <td className="ctr" style={{ color: "#94a3b8" }}>
          {index}
        </td>
        <td>
          <span className="reg-name">{p.name}</span>
          {p.role === "REPRESENTATIVE" ? (
            <span className="reg-rep"> [R]</span>
          ) : null}
        </td>
        <td className="ctr">{GENDER_SHORT[p.gender] ?? p.gender}</td>
        <td className="ctr">{age}</td>
        <td>{p.stayDates}</td>
        <td className="reg-meals">{p.meals}</td>
        <td>
          <span className="reg-trunc" title={p.department ?? undefined}>
            {p.department ?? "—"}
          </span>
        </td>
        <td>
          <span className="reg-trunc" title={p.church ?? undefined}>
            {p.church ?? "—"}
          </span>
        </td>
      </tr>
      {contact.length > 0 && (
        <tr>
          <td />
          <td colSpan={7} className="reg-contact">
            {contact.join("  ·  ")}
          </td>
        </tr>
      )}
    </>
  );
}
