"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  Check,
  Ban,
  RefreshCw,
  Pencil,
  Trash2,
  Minus,
  Plus,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatters";

interface MealPassRequest {
  id: string;
  payerName: string | null;
  payerEmail: string | null;
  payerPhone: string | null;
  churchName: string | null;
  amountCents: number;
  method: string | null;
  status: string;
  general: number;
  youth: number;
  locked: boolean;
  createdAt: string;
}

const STATUS_FILTERS = ["SUBMITTED", "APPROVED", "VOID", "ALL"] as const;

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "APPROVED" ? "default" : status === "SUBMITTED" ? "secondary" : "outline";
  const label = status === "SUBMITTED" ? "Awaiting approval" : status;
  return <Badge variant={variant}>{label}</Badge>;
}

function passesSummary(r: MealPassRequest): string {
  return (
    [
      r.general > 0 ? `General × ${r.general}` : null,
      r.youth > 0 ? `Youth × ${r.youth}` : null,
    ]
      .filter(Boolean)
      .join(" + ") || "—"
  );
}

export default function MealPassesPage() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("SUBMITTED");
  const [rows, setRows] = useState<MealPassRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/meal-passes?status=${status}`);
      const data = await res.json();
      if (res.ok) setRows(data.requests);
      else toast.error(data.error || "Failed to load");
    } catch {
      toast.error("Network error");
    }
    setLoading(false);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---- edit dialog ---- */
  const [editing, setEditing] = useState<MealPassRequest | null>(null);
  const [form, setForm] = useState({
    payerName: "",
    payerEmail: "",
    payerPhone: "",
    churchName: "",
    general: 0,
    youth: 0,
  });
  const [saving, setSaving] = useState(false);

  const openEdit = (r: MealPassRequest) => {
    setForm({
      payerName: r.payerName ?? "",
      payerEmail: r.payerEmail ?? "",
      payerPhone: r.payerPhone ?? "",
      churchName: r.churchName ?? "",
      general: r.general,
      youth: r.youth,
    });
    setEditing(r);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (form.general + form.youth < 1) {
      toast.error("At least one pass is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/meal-passes/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Request updated");
        setEditing(null);
        await load();
      } else {
        toast.error(data.error || "Failed to save");
      }
    } catch {
      toast.error("Network error");
    }
    setSaving(false);
  };

  const del = async (r: MealPassRequest) => {
    if (!confirm("Delete this request permanently? This cannot be undone.")) {
      return;
    }
    setActingId(r.id);
    try {
      const res = await fetch(`/api/admin/meal-passes/${r.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Request deleted");
        await load();
      } else {
        toast.error(data.error || "Failed to delete");
      }
    } catch {
      toast.error("Network error");
    }
    setActingId(null);
  };

  const act = async (id: string, action: "approve" | "void") => {
    if (action === "void" && !confirm("Void this request? It will leave the queue.")) {
      return;
    }
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/meal-passes/${id}/${action}`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(action === "approve" ? "Request approved" : "Request voided");
        await load();
      } else {
        toast.error(data.error || "Action failed");
      }
    } catch {
      toast.error("Network error");
    }
    setActingId(null);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Meal Passes</h1>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      <div className="p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Physical meal-pass requests. Card requests are paid online (they arrive
          already approved); Zelle / Cash / Check are paid at the desk — confirm
          payment, then approve. Hand the buyer the matching number of pre-printed
          QR cards from <span className="font-medium">Print → QR Cards</span>.
        </p>

        {/* Status filter */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={status === s ? "default" : "outline"}
              onClick={() => setStatus(s)}
            >
              {s === "SUBMITTED" ? "Awaiting" : s === "ALL" ? "All" : s}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
            No requests in this status.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Buyer</th>
                  <th className="px-3 py-2 font-medium">Passes</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.payerName || "—"}</div>
                      {r.churchName && (
                        <div className="text-xs text-muted-foreground">{r.churchName}</div>
                      )}
                      {(r.payerEmail || r.payerPhone) && (
                        <div className="text-xs text-muted-foreground">
                          {[r.payerEmail, r.payerPhone].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">{passesSummary(r)}</td>
                    <td className="px-3 py-2">{formatCurrency(r.amountCents)}</td>
                    <td className="px-3 py-2">{r.method ?? "—"}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        {r.status === "SUBMITTED" && (
                          <Button
                            size="sm"
                            onClick={() => void act(r.id, "approve")}
                            disabled={actingId === r.id}
                          >
                            {actingId === r.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                Approve
                              </>
                            )}
                          </Button>
                        )}
                        {r.status === "SUBMITTED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void act(r.id, "void")}
                            disabled={actingId === r.id}
                          >
                            <Ban className="h-4 w-4 mr-1" />
                            Void
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(r)}
                          disabled={actingId === r.id}
                          aria-label="Edit request"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => void del(r)}
                          disabled={actingId === r.id}
                          aria-label="Delete request"
                        >
                          {actingId === r.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Request</DialogTitle>
            <DialogDescription>
              Update the buyer&apos;s details
              {editing?.locked ? "." : " and pass counts."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Legal Name</Label>
              <Input
                value={form.payerName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, payerName: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.payerEmail}
                onChange={(e) =>
                  setForm((f) => ({ ...f, payerEmail: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input
                  value={form.payerPhone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, payerPhone: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Church</Label>
                <Input
                  value={form.churchName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, churchName: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(["general", "youth"] as const).map((k) => (
                <div key={k} className="space-y-1">
                  <Label>{k === "general" ? "General (11+)" : "Youth (5–10)"}</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={editing?.locked || form[k] <= 0}
                      onClick={() =>
                        setForm((f) => ({ ...f, [k]: Math.max(0, f[k] - 1) }))
                      }
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      inputMode="numeric"
                      className="w-16 text-center"
                      value={form[k]}
                      disabled={editing?.locked}
                      onChange={(e) => {
                        const n = parseInt(
                          e.target.value.replace(/[^0-9]/g, ""),
                          10
                        );
                        setForm((f) => ({
                          ...f,
                          [k]: isFinite(n) ? Math.min(200, Math.max(0, n)) : 0,
                        }));
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={editing?.locked}
                      onClick={() =>
                        setForm((f) => ({ ...f, [k]: Math.min(200, f[k] + 1) }))
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {editing?.locked && (
              <p className="text-xs text-muted-foreground">
                Counts are locked — this request was paid online by card. You can
                still edit the buyer&apos;s contact info.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
