"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer, Loader2, FileDown } from "lucide-react";

interface Participant {
  name: string;
  nameKo: string | null;
  gender: string;
  age: number | null;
  isK12: boolean;
  grade: string | null;
  email: string | null;
  phone: string | null;
  church: string | null;
  department: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  groupCode: string;
  role: string;
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
  eventName: string;
  startDate: string;
  endDate: string;
  nightsCount: number;
  registrationType: string;
  status: string;
  totalAmount: string;
  participants: Participant[];
  lineItems: LineItem[];
  subtotal: string;
  total: string;
}

interface EventOption {
  id: string;
  name_en: string;
  year: number;
  is_default: boolean;
}

const STATUS_OPTIONS = [
  "PAID",
  "APPROVED",
  "SUBMITTED",
  "ALL",
];

export default function PrintRegistrationsPage() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState<string>("");
  const [status, setStatus] = useState("PAID");
  const [registrations, setRegistrations] = useState<RegistrationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Load events
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
        const defaultEvent = data.find((e) => e.is_default) ?? data[0];
        setEventId(defaultEvent.id);
      }
    };
    loadEvents();
  }, []);

  const loadRegistrations = async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/print/registrations?eventId=${eventId}&status=${status}`
      );
      const data = await res.json();
      setRegistrations(data.registrations ?? []);
      setLoaded(true);
    } catch {
      setRegistrations([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const [downloading, setDownloading] = useState(false);

  /** Download a single blob and trigger browser save */
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** Download one bulk PDF containing ALL registration summaries */
  const handleDownloadAll = async () => {
    if (!eventId) return;
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/admin/print/registrations/pdf?eventId=${eventId}&status=${status}`
      );
      if (!res.ok) {
        const body = await res.text();
        console.error(`Bulk PDF failed [${res.status}]:`, body);
        return;
      }
      const blob = await res.blob();
      triggerDownload(blob, `eckcm-registration-summaries-${status.toLowerCase()}.pdf`);
    } catch (err) {
      console.error("Bulk PDF download failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  /** Download a single registration summary PDF */
  const handleDownloadSingle = async (reg: RegistrationSummary) => {
    try {
      const res = await fetch(`/api/registration/${reg.id}/summary-pdf`);
      if (!res.ok) throw new Error("Failed to download PDF");
      const blob = await res.blob();
      triggerDownload(blob, `eckcm-summary-${reg.confirmationCode}.pdf`);
    } catch (err) {
      console.error(`Download failed for ${reg.confirmationCode}:`, err);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header — hidden in print */}
      <header className="flex h-14 items-center gap-2 border-b px-4 print:hidden">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Print Registration Summaries</h1>
      </header>

      {/* Controls — hidden in print */}
      <div className="p-6 space-y-4 print:hidden">
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
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            Load Registrations
          </Button>

          {registrations.length > 0 && (
            <>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="size-4 mr-2" />
                Print All ({registrations.length})
              </Button>
              <Button variant="outline" onClick={handleDownloadAll} disabled={downloading}>
                {downloading ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <FileDown className="size-4 mr-2" />
                )}
                {downloading
                  ? "Generating PDF..."
                  : `Download All as PDF (${registrations.length})`}
              </Button>
            </>
          )}
        </div>

        {loaded && (
          <p className="text-sm text-muted-foreground">
            {registrations.length} registration{registrations.length !== 1 ? "s" : ""} found
          </p>
        )}
      </div>

      {/* Print Area */}
      <div ref={printRef} className="print:p-0">
        {registrations.map((reg, idx) => (
          <div
            key={reg.id}
            className={`p-6 mx-auto max-w-4xl ${
              idx < registrations.length - 1 ? "mb-8 print:mb-0" : ""
            } print:break-after-page print:p-8 print:max-w-none`}
          >
            <RegistrationCard reg={reg} onDownload={handleDownloadSingle} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Registration Card ─────────────────────────────────────────────────────── */

function RegistrationCard({
  reg,
  onDownload,
}: {
  reg: RegistrationSummary;
  onDownload: (reg: RegistrationSummary) => void;
}) {
  const representative = reg.participants.find((p) => p.role === "REPRESENTATIVE");

  return (
    <div className="border rounded-lg print:border-black print:border print:rounded-none">
      {/* Card Header */}
      <div className="bg-slate-900 text-white px-6 py-4 rounded-t-lg print:rounded-none flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">ECKCM Registration Summary</h2>
          <p className="text-slate-400 text-sm">East Coast Korean Camp Meeting</p>
        </div>
        <div className="text-right flex items-center gap-3">
          <button
            onClick={() => onDownload(reg)}
            className="text-slate-400 hover:text-white transition-colors print:hidden"
            title="Download PDF"
          >
            <FileDown className="size-5" />
          </button>
          <div>
            <p className="text-xl font-mono font-bold">{reg.confirmationCode}</p>
            <Badge
              variant={reg.status === "PAID" ? "default" : "secondary"}
              className="mt-1"
            >
              {reg.status}
            </Badge>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-5">
        {/* Registration Info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <InfoItem label="Event" value={reg.eventName} />
          <InfoItem label="Dates" value={`${reg.startDate} ~ ${reg.endDate}`} />
          <InfoItem label="Nights" value={String(reg.nightsCount)} />
          <InfoItem label="Total" value={reg.totalAmount} />
          <InfoItem
            label="Registrant"
            value={representative?.name ?? "-"}
          />
          <InfoItem
            label="Type"
            value={reg.registrationType === "others" ? "Others" : "Self"}
          />
        </div>

        <hr className="print:border-black" />

        {/* Participants */}
        <div>
          <h3 className="text-sm font-semibold mb-2">
            Participants ({reg.participants.length})
          </h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 print:bg-gray-100">
                <th className="text-left px-2 py-1.5 font-medium text-xs text-slate-500 border-b">#</th>
                <th className="text-left px-2 py-1.5 font-medium text-xs text-slate-500 border-b">Name</th>
                <th className="text-left px-2 py-1.5 font-medium text-xs text-slate-500 border-b">Display Name</th>
                <th className="text-left px-2 py-1.5 font-medium text-xs text-slate-500 border-b">Gender</th>
                <th className="text-left px-2 py-1.5 font-medium text-xs text-slate-500 border-b">Age</th>
                <th className="text-left px-2 py-1.5 font-medium text-xs text-slate-500 border-b">Church</th>
                <th className="text-left px-2 py-1.5 font-medium text-xs text-slate-500 border-b">Dept</th>
              </tr>
            </thead>
            <tbody>
              {reg.participants.map((p, i) => (
                <ParticipantRow key={i} participant={p} index={i + 1} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pricing */}
        {reg.lineItems.length > 0 && (
          <>
            <hr className="print:border-black" />
            <div>
              <h3 className="text-sm font-semibold mb-2">Pricing Breakdown</h3>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 print:bg-gray-100">
                    <th className="text-left px-2 py-1.5 font-medium text-xs text-slate-500 border-b">Description</th>
                    <th className="text-center px-2 py-1.5 font-medium text-xs text-slate-500 border-b">Qty</th>
                    <th className="text-right px-2 py-1.5 font-medium text-xs text-slate-500 border-b">Unit Price</th>
                    <th className="text-right px-2 py-1.5 font-medium text-xs text-slate-500 border-b">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {reg.lineItems.map((item, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-2 py-1.5">{item.description}</td>
                      <td className="px-2 py-1.5 text-center">{item.quantity}</td>
                      <td className="px-2 py-1.5 text-right">{item.unitPrice}</td>
                      <td className="px-2 py-1.5 text-right">{item.amount}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300">
                    <td colSpan={3} className="px-2 py-1.5 text-right font-medium">
                      Total
                    </td>
                    <td className="px-2 py-1.5 text-right font-bold">
                      {reg.total}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Card Footer */}
      <div className="border-t px-6 py-2 text-xs text-slate-400 flex justify-between">
        <span>East Coast Korean Camp Meeting</span>
        <span>Generated {new Date().toLocaleDateString("en-US")}</span>
      </div>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────────────── */

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function ParticipantRow({
  participant: p,
  index,
}: {
  participant: Participant;
  index: number;
}) {
  return (
    <>
      <tr className="border-b border-slate-100">
        <td className="px-2 py-1.5 text-slate-400">{index}</td>
        <td className="px-2 py-1.5 font-medium whitespace-nowrap">
          {p.name}
          {p.role === "REPRESENTATIVE" && (
            <span className="ml-1 text-xs text-blue-600 font-normal">[R]</span>
          )}
        </td>
        <td className="px-2 py-1.5">{p.nameKo ?? "-"}</td>
        <td className="px-2 py-1.5">{p.gender}</td>
        <td className="px-2 py-1.5">
          {p.age ?? "-"}
          {p.isK12 && p.grade ? ` (${p.grade})` : p.isK12 ? " K12" : ""}
        </td>
        <td className="px-2 py-1.5 text-xs">{p.church ?? "-"}</td>
        <td className="px-2 py-1.5 text-xs">{p.department ?? "-"}</td>
      </tr>
      {/* Contact detail sub-row */}
      {(p.email || p.phone || p.guardianName) && (
        <tr className="border-b border-slate-50">
          <td />
          <td colSpan={6} className="px-2 py-0.5 text-xs text-slate-400">
            {[
              p.email,
              p.phone,
              p.guardianName
                ? `Guardian: ${p.guardianName}${p.guardianPhone ? ` (${p.guardianPhone})` : ""}`
                : null,
            ]
              .filter(Boolean)
              .join("  |  ")}
          </td>
        </tr>
      )}
    </>
  );
}
