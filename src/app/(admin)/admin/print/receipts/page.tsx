"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer, Loader2, Plus, Trash2, Save, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatters";
import { RegistrationCombobox } from "@/components/admin/registration-combobox";
import {
  sumLineItems,
  type ManualReceipt,
  type ReceiptLineItem,
} from "@/lib/print/manual-receipt";

interface EventOption {
  id: string;
  name_en: string;
  year: number;
  is_default: boolean;
}

/** The form state mirrors a receipt minus server-managed fields. */
interface ReceiptForm {
  id: string | null; // null = new, unsaved
  receiptNumber: string; // blank on a new receipt → server auto-assigns
  eventId: string | null;
  registrationId: string | null;
  recipientName: string;
  recipientDetail: string;
  receiptDate: string; // YYYY-MM-DD
  paymentMethod: string;
  memo: string;
  lineItems: ReceiptLineItem[];
}

function todayEastern(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function emptyForm(eventId: string | null): ReceiptForm {
  return {
    id: null,
    receiptNumber: "",
    eventId,
    registrationId: null,
    recipientName: "",
    recipientDetail: "",
    receiptDate: todayEastern(),
    paymentMethod: "",
    memo: "",
    lineItems: [{ description: "", quantity: 1, unitPriceCents: 0, amountCents: 0 }],
  };
}

function receiptToForm(r: ManualReceipt): ReceiptForm {
  return {
    id: r.id,
    receiptNumber: r.receiptNumber,
    eventId: r.eventId,
    registrationId: r.registrationId,
    recipientName: r.recipientName,
    recipientDetail: r.recipientDetail ?? "",
    receiptDate: r.receiptDate,
    paymentMethod: r.paymentMethod ?? "",
    memo: r.memo ?? "",
    lineItems:
      r.lineItems.length > 0
        ? r.lineItems
        : [{ description: "", quantity: 1, unitPriceCents: 0, amountCents: 0 }],
  };
}

/* Dollars ↔ cents helpers for the editable money inputs. */
const centsToInput = (c: number) => (c / 100).toFixed(2);
const inputToCents = (s: string) => Math.round((parseFloat(s) || 0) * 100);

const PRINT_CSS = `
.mr-workbench { background: #6b7280; padding: 24px; display: flex; justify-content: center; }
.mr-sheet {
  position: relative;
  width: 8.5in;
  min-height: 11in;
  background: #fff;
  color: #0f172a;
  box-sizing: border-box;
  padding: 0.75in;
  box-shadow: 0 2px 12px rgba(0,0,0,0.35);
  font-family: ui-sans-serif, system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  font-size: 11pt;
  line-height: 1.4;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.mr-head { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2.5px solid #2563eb; padding-bottom: 14px; }
.mr-org { font-size: 18pt; font-weight: 800; color: #1e3a8a; letter-spacing: -0.01em; }
.mr-org-sub { font-size: 9pt; color: #64748b; margin-top: 2px; }
.mr-title { text-align: right; }
.mr-title-h { font-size: 20pt; font-weight: 800; color: #0f172a; letter-spacing: 0.02em; }
.mr-num { font-family: ui-monospace, monospace; font-size: 11pt; font-weight: 700; color: #2563eb; margin-top: 2px; }
.mr-date { font-size: 10pt; color: #475569; margin-top: 2px; }
.mr-meta { display: flex; gap: 48px; margin: 22px 0 8px; }
.mr-meta-l { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
.mr-meta-v { font-size: 12pt; font-weight: 700; }
.mr-meta-v.sub { font-size: 10pt; font-weight: 500; color: #475569; }
.mr-table { width: 100%; border-collapse: collapse; margin-top: 18px; }
.mr-table th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; font-weight: 600; padding: 6px 8px; border-bottom: 1.5px solid #cbd5e1; }
.mr-table td { padding: 7px 8px; border-bottom: 0.75pt solid #e2e8f0; vertical-align: top; }
.mr-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.mr-table tfoot td { border-bottom: none; border-top: 2px solid #94a3b8; font-weight: 800; font-size: 13pt; padding-top: 10px; }
.mr-memo { margin-top: 28px; }
.mr-memo-l { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 4px; }
.mr-memo-v { font-size: 10pt; color: #334155; white-space: pre-wrap; }
.mr-foot { margin-top: 48px; padding-top: 10px; border-top: 0.75pt solid #e2e8f0; display: flex; justify-content: space-between; font-size: 8pt; color: #94a3b8; }

@media print {
  @page { size: letter portrait; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .mr-no-print { display: none !important; }
  .mr-workbench { background: #fff !important; padding: 0 !important; display: block !important; }
  .mr-sheet { box-shadow: none !important; margin: 0 !important; width: 100%; min-height: 100vh; }
}
`;

export default function ManualReceiptsPage() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [receipts, setReceipts] = useState<ManualReceipt[]>([]);
  const [form, setForm] = useState<ReceiptForm | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  // Bumped after each import to remount the registration picker (resets it).
  const [importPickerKey, setImportPickerKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/admin/print/receipts");
      const data = await res.json();
      if (res.ok) setReceipts(data.receipts ?? []);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("eckcm_events")
        .select("id, name_en, year, is_default")
        .order("is_default", { ascending: false })
        .order("year", { ascending: false });
      const evs = data ?? [];
      setEvents(evs);
      const defaultEvent = evs.find((e) => e.is_default) ?? evs[0] ?? null;
      setForm(emptyForm(defaultEvent?.id ?? null));
    };
    init();
    refreshList();
  }, [refreshList]);

  const total = form ? sumLineItems(form.lineItems) : 0;

  /* ── Form mutators ── */
  const update = (patch: Partial<ReceiptForm>) =>
    setForm((f) => (f ? { ...f, ...patch } : f));

  const updateLine = (i: number, patch: Partial<ReceiptLineItem>) =>
    setForm((f) => {
      if (!f) return f;
      const lineItems = f.lineItems.map((li, idx) => {
        if (idx !== i) return li;
        const next = { ...li, ...patch };
        // Keep amount in sync with qty × unit unless amount was the field edited.
        if (!("amountCents" in patch)) {
          next.amountCents = next.quantity * next.unitPriceCents;
        }
        return next;
      });
      return { ...f, lineItems };
    });

  const addLine = () =>
    setForm((f) =>
      f
        ? {
            ...f,
            lineItems: [
              ...f.lineItems,
              { description: "", quantity: 1, unitPriceCents: 0, amountCents: 0 },
            ],
          }
        : f
    );

  const removeLine = (i: number) =>
    setForm((f) =>
      f ? { ...f, lineItems: f.lineItems.filter((_, idx) => idx !== i) } : f
    );

  const newReceipt = () => {
    setError(null);
    setForm(emptyForm(form?.eventId ?? events[0]?.id ?? null));
  };

  const openReceipt = (r: ManualReceipt) => {
    setError(null);
    setForm(receiptToForm(r));
  };

  /* ── Import a snapshot from a registration (does not save) ── */
  const importFromRegistration = async (registrationId: string) => {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/print/receipts/from-registration?registrationId=${encodeURIComponent(registrationId)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Could not import registration");
        return;
      }
      const s = data.snapshot;
      setForm({
        id: null,
        receiptNumber: "",
        eventId: s.eventId ?? form?.eventId ?? null,
        registrationId: s.registrationId ?? null,
        recipientName: s.recipientName ?? "",
        recipientDetail: s.recipientDetail ?? "",
        receiptDate: todayEastern(),
        paymentMethod: s.paymentMethod ?? "",
        memo: s.confirmationCode ? `Registration ${s.confirmationCode}` : "",
        lineItems:
          s.lineItems?.length > 0
            ? s.lineItems
            : [{ description: "", quantity: 1, unitPriceCents: 0, amountCents: 0 }],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
      setImportPickerKey((k) => k + 1);
    }
  };

  /* ── Save (create or update) ── */
  const save = async () => {
    if (!form) return;
    if (!form.recipientName.trim()) {
      setError("Recipient name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        eventId: form.eventId,
        registrationId: form.registrationId,
        receiptNumber: form.receiptNumber || undefined,
        recipientName: form.recipientName,
        recipientDetail: form.recipientDetail || null,
        receiptDate: form.receiptDate,
        paymentMethod: form.paymentMethod || null,
        memo: form.memo || null,
        lineItems: form.lineItems,
        amountCents: total,
      };
      const res = await fetch(
        form.id
          ? `/api/admin/print/receipts/${form.id}`
          : "/api/admin/print/receipts",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Save failed");
        return;
      }
      setForm(receiptToForm(data.receipt));
      await refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteReceipt = async (r: ManualReceipt) => {
    if (!confirm(`Delete receipt ${r.receiptNumber}? This cannot be undone.`))
      return;
    const res = await fetch(`/api/admin/print/receipts/${r.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      if (form?.id === r.id) newReceipt();
      await refreshList();
    }
  };

  if (!form) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const eventName =
    events.find((e) => e.id === form.eventId)?.name_en ??
    "East Coast Korean Camp Meeting";

  return (
    <div className="flex flex-col">
      <style>{PRINT_CSS}</style>

      {/* Header */}
      <div className="mr-no-print flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Manual Receipts</h1>
        <span className="text-xs text-muted-foreground">
          Build, save, and print a receipt by hand — or import one from a registration
        </span>
      </div>

      <div className="mr-no-print grid gap-6 p-6 lg:grid-cols-[300px_1fr]">
        {/* ── Left: saved receipts list ── */}
        <aside className="space-y-3">
          <Button onClick={newReceipt} className="w-full" variant="default">
            <Plus className="size-4 mr-2" /> New Receipt
          </Button>

          <div className="space-y-2 rounded-md border p-3">
            <Label className="flex items-center gap-2 text-xs">
              Import from registration
              {importing && <Loader2 className="size-3 animate-spin" />}
            </Label>
            <RegistrationCombobox
              key={importPickerKey}
              eventId={form.eventId}
              onSelect={(r) => {
                if (r) importFromRegistration(r.id);
              }}
            />
          </div>

          <div className="rounded-md border">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              Saved Receipts {loadingList ? "" : `(${receipts.length})`}
            </div>
            <div className="max-h-[60vh] overflow-auto">
              {receipts.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  No saved receipts yet.
                </p>
              ) : (
                receipts.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => openReceipt(r)}
                    className={`flex w-full items-start justify-between gap-2 border-b px-3 py-2 text-left text-sm hover:bg-muted/50 ${
                      form.id === r.id ? "bg-muted" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {r.recipientName || "—"}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {r.receiptNumber} · {formatCurrency(r.amountCents)}
                      </div>
                    </div>
                    <Trash2
                      className="size-4 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteReceipt(r);
                      }}
                    />
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* ── Right: editor + preview ── */}
        <div className="space-y-6">
          {/* Editor */}
          <div className="space-y-4 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold">
                <FileText className="size-4" />
                {form.id ? "Edit Receipt" : "New Receipt"}
              </h2>
              <div className="flex gap-2">
                <Button onClick={save} disabled={saving}>
                  {saving ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <Save className="size-4 mr-2" />
                  )}
                  {form.id ? "Save Changes" : "Save Receipt"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.print()}
                  disabled={!form.id}
                  title={form.id ? "Print" : "Save first to print"}
                >
                  <Printer className="size-4 mr-2" /> Print
                </Button>
              </div>
            </div>

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Recipient Name *</Label>
                <Input
                  value={form.recipientName}
                  onChange={(e) => update({ recipientName: e.target.value })}
                  placeholder="John Kim"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Recipient Detail (church / email)</Label>
                <Input
                  value={form.recipientDetail}
                  onChange={(e) => update({ recipientDetail: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Receipt Date</Label>
                <Input
                  type="date"
                  value={form.receiptDate}
                  onChange={(e) => update({ receiptDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Input
                  value={form.paymentMethod}
                  onChange={(e) => update({ paymentMethod: e.target.value })}
                  placeholder="Cash / Check / Card …"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Receipt Number</Label>
                <Input
                  value={form.receiptNumber}
                  onChange={(e) => update({ receiptNumber: e.target.value })}
                  placeholder="Auto (MR-YYYY-NNNN)"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Event</Label>
                <Select
                  value={form.eventId ?? "none"}
                  onValueChange={(v) => update({ eventId: v === "none" ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {events.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name_en} ({e.year})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Line items editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button variant="outline" size="sm" onClick={addLine}>
                  <Plus className="size-3.5 mr-1" /> Add line
                </Button>
              </div>
              <div className="space-y-2">
                {form.lineItems.map((li, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_70px_110px_110px_36px] items-center gap-2"
                  >
                    <Input
                      placeholder="Description"
                      value={li.description}
                      onChange={(e) =>
                        updateLine(i, { description: e.target.value })
                      }
                    />
                    <Input
                      type="number"
                      min={1}
                      value={li.quantity}
                      onChange={(e) =>
                        updateLine(i, {
                          quantity: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                      title="Quantity"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={centsToInput(li.unitPriceCents)}
                      onChange={(e) =>
                        updateLine(i, {
                          unitPriceCents: inputToCents(e.target.value),
                        })
                      }
                      title="Unit price"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={centsToInput(li.amountCents)}
                      onChange={(e) =>
                        updateLine(i, {
                          amountCents: inputToCents(e.target.value),
                        })
                      }
                      title="Amount"
                      className="font-medium"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(i)}
                      disabled={form.lineItems.length === 1}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pr-[36px] pt-1 text-sm font-semibold">
                Total: {formatCurrency(total)}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Memo / Note</Label>
              <Textarea
                value={form.memo}
                onChange={(e) => update({ memo: e.target.value })}
                placeholder="Optional note shown on the receipt"
                rows={2}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Printable receipt sheet (also the on-screen preview) ── */}
      <div className="mr-workbench">
        <div className="mr-sheet">
          <div className="mr-head">
            <div>
              <div className="mr-org">ECKCM</div>
              <div className="mr-org-sub">{eventName}</div>
            </div>
            <div className="mr-title">
              <div className="mr-title-h">RECEIPT</div>
              <div className="mr-num">{form.receiptNumber || "(unsaved)"}</div>
              <div className="mr-date">{form.receiptDate}</div>
            </div>
          </div>

          <div className="mr-meta">
            <div>
              <div className="mr-meta-l">Received From</div>
              <div className="mr-meta-v">{form.recipientName || "—"}</div>
              {form.recipientDetail && (
                <div className="mr-meta-v sub">{form.recipientDetail}</div>
              )}
            </div>
            {form.paymentMethod && (
              <div>
                <div className="mr-meta-l">Payment Method</div>
                <div className="mr-meta-v">{form.paymentMethod}</div>
              </div>
            )}
          </div>

          <table className="mr-table">
            <thead>
              <tr>
                <th>Description</th>
                <th className="num">Qty</th>
                <th className="num">Unit Price</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {form.lineItems.map((li, i) => (
                <tr key={i}>
                  <td>{li.description || "—"}</td>
                  <td className="num">{li.quantity}</td>
                  <td className="num">{formatCurrency(li.unitPriceCents)}</td>
                  <td className="num">{formatCurrency(li.amountCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="num">
                  Total
                </td>
                <td className="num">{formatCurrency(total)}</td>
              </tr>
            </tfoot>
          </table>

          {form.memo && (
            <div className="mr-memo">
              <div className="mr-memo-l">Memo</div>
              <div className="mr-memo-v">{form.memo}</div>
            </div>
          )}

          <div className="mr-foot">
            <span>East Coast Korean Camp Meeting · eckcm.com</span>
            <span>{form.receiptNumber}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
