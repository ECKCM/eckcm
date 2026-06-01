"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  Download,
  MoreHorizontal,
  RefreshCw,
  Undo2,
  Trash2,
  Receipt,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils/formatters";

export interface DonationRow {
  id: string;
  donor_name: string | null;
  donor_email: string | null;
  amount_cents: number;
  fee_cents: number;
  covers_fees: boolean;
  payment_method: string;
  status: string;
  stripe_payment_intent_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface RefundInfo {
  grossCents: number;
  alreadyRefundedCents: number;
  remainingCents: number;
  deductStripeFees: boolean;
  stripeFeesCents: number;
  suggestedCents: number;
  isCard: boolean;
  status: string;
}

const FMT_DATE = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

function methodKey(row: DonationRow): "card" | "zelle" | "check" | "cash" | "other" {
  if (row.payment_method === "CARD") return "card";
  const dm = (row.metadata?.donation_method as string | undefined)?.toLowerCase();
  if (dm === "zelle" || dm === "check" || dm === "cash") return dm;
  if (row.payment_method === "ZELLE") return "zelle";
  if (row.payment_method === "CHECK") return "check";
  if (row.payment_method === "ONSITE") return "cash";
  return "other";
}

function methodLabel(row: DonationRow): string {
  const k = methodKey(row);
  return k === "other" ? row.payment_method : k.charAt(0).toUpperCase() + k.slice(1);
}

function designationOf(row: DonationRow): string {
  return (row.metadata?.designation as string | undefined) ?? "Camp Meeting (General)";
}

/** Full amount charged/pledged (donation + any covered fee). */
function totalOf(row: DonationRow): number {
  return row.amount_cents + (row.fee_cents ?? 0);
}

const STATUS_STYLES: Record<string, string> = {
  SUCCEEDED: "bg-green-100 text-green-800 border-green-200",
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  FAILED: "bg-red-100 text-red-700 border-red-200",
  REFUNDED: "bg-slate-100 text-slate-700 border-slate-200",
  PARTIALLY_REFUNDED: "bg-slate-100 text-slate-700 border-slate-200",
};

export function DonationsTable({ donations }: { donations: DonationRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Refund dialog state
  const [refundRow, setRefundRow] = useState<DonationRow | null>(null);
  const [refundInfo, setRefundInfo] = useState<RefundInfo | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundSubmitting, setRefundSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return donations.filter((d) => {
      if (methodFilter !== "all" && methodKey(d) !== methodFilter) return false;
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (q) {
        const hay = `${d.donor_name ?? ""} ${d.donor_email ?? ""} ${designationOf(d)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [donations, search, methodFilter, statusFilter]);

  const totals = useMemo(() => {
    let received = 0, receivedCount = 0, pending = 0, pendingCount = 0;
    for (const d of donations) {
      if (d.status === "SUCCEEDED") {
        received += totalOf(d);
        receivedCount++;
      } else if (d.status === "PENDING") {
        pending += totalOf(d);
        pendingCount++;
      }
    }
    return { received, receivedCount, pending, pendingCount };
  }, [donations]);

  const markReceived = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/donations/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SUCCEEDED" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update donation");
        return;
      }
      toast.success("Marked as received — receipt emailed");
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const syncFromStripe = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/donations/${id}/sync`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Sync failed");
        return;
      }
      toast.success(
        data.changed ? `Updated to ${data.status} (Stripe: ${data.stripeStatus})` : `Already in sync (${data.status})`
      );
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteDonation = async (row: DonationRow) => {
    if (!window.confirm(`Delete this ${methodLabel(row)} donation of ${formatCurrency(totalOf(row))}? This cannot be undone.`)) {
      return;
    }
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/donations/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete");
        return;
      }
      toast.success("Donation deleted");
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const openRefund = async (row: DonationRow) => {
    setRefundRow(row);
    setRefundInfo(null);
    setRefundReason("");
    setRefundAmount("");
    setRefundLoading(true);
    try {
      const res = await fetch(`/api/admin/donations/${row.id}/refund`);
      const data = (await res.json()) as RefundInfo;
      if (!res.ok) {
        toast.error("Failed to load refund info");
        setRefundRow(null);
        return;
      }
      setRefundInfo(data);
      setRefundAmount((data.suggestedCents / 100).toFixed(2));
    } catch {
      toast.error("Network error. Please try again.");
      setRefundRow(null);
    } finally {
      setRefundLoading(false);
    }
  };

  const submitRefund = async () => {
    if (!refundRow || !refundInfo) return;
    const cents = Math.round(parseFloat(refundAmount || "0") * 100);
    if (!Number.isFinite(cents) || cents <= 0 || cents > refundInfo.remainingCents) {
      toast.error(`Enter an amount between $0.01 and ${formatCurrency(refundInfo.remainingCents)}`);
      return;
    }
    setRefundSubmitting(true);
    try {
      const res = await fetch(`/api/admin/donations/${refundRow.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents, reason: refundReason || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Refund failed");
        return;
      }
      toast.success(
        `Refunded ${formatCurrency(cents)}${refundInfo.isCard ? " via Stripe" : " (manual)"}`
      );
      setRefundRow(null);
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setRefundSubmitting(false);
    }
  };

  const exportCsv = () => {
    const header = ["Date", "Donor", "Email", "Amount", "Designation", "Method", "Status", "PaymentRef"];
    const rows = filtered.map((d) => [
      FMT_DATE.format(new Date(d.created_at)),
      d.donor_name ?? "",
      d.donor_email ?? "",
      (totalOf(d) / 100).toFixed(2),
      designationOf(d),
      methodLabel(d),
      d.status,
      d.stripe_payment_intent_id ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "eckcm-donations.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Received</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(totals.received)}</p>
            <p className="text-xs text-muted-foreground">{totals.receivedCount} donations</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-700">{formatCurrency(totals.pending)}</p>
            <p className="text-xs text-muted-foreground">{totals.pendingCount} awaiting receipt</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search donor / email / designation"
          className="max-w-xs"
        />
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="zelle">Zelle</SelectItem>
            <SelectItem value="check">Check</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="SUCCEEDED">Succeeded</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="REFUNDED">Refunded</SelectItem>
            <SelectItem value="PARTIALLY_REFUNDED">Partially refunded</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-1.5 size-4" />
          CSV
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Donor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No donations found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((d) => {
                  const isCard = methodKey(d) === "card";
                  const canRefund = d.status === "SUCCEEDED" || d.status === "PARTIALLY_REFUNDED";
                  const canMarkReceived = !isCard && d.status === "PENDING";
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {FMT_DATE.format(new Date(d.created_at))}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{d.donor_name || "Anonymous"}</div>
                        {d.donor_email && (
                          <div className="text-xs text-muted-foreground">{d.donor_email}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(totalOf(d))}</TableCell>
                      <TableCell className="text-sm">{designationOf(d)}</TableCell>
                      <TableCell className="text-sm">{methodLabel(d)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_STYLES[d.status] ?? ""}>
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canMarkReceived && (
                            <Button size="sm" disabled={busyId === d.id} onClick={() => markReceived(d.id)}>
                              {busyId === d.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle2 className="mr-1 size-4" />
                                  Mark Received
                                </>
                              )}
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8" disabled={busyId === d.id}>
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => window.open(`/api/admin/donations/${d.id}/receipt`, "_blank")}
                              >
                                <Receipt className="mr-2 size-4" />
                                Receipt PDF
                              </DropdownMenuItem>

                              {isCard && (
                                <DropdownMenuItem onClick={() => syncFromStripe(d.id)}>
                                  <RefreshCw className="mr-2 size-4" />
                                  Sync from Stripe
                                </DropdownMenuItem>
                              )}

                              {canRefund && (
                                <DropdownMenuItem onClick={() => openRefund(d)}>
                                  <Undo2 className="mr-2 size-4" />
                                  Refund{isCard ? "" : " (manual)"}
                                </DropdownMenuItem>
                              )}

                              {!isCard && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => deleteDonation(d)}
                                  >
                                    <Trash2 className="mr-2 size-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Refund dialog */}
      <Dialog open={!!refundRow} onOpenChange={(o) => !o && setRefundRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Refund {refundRow ? methodLabel(refundRow) : ""} donation
            </DialogTitle>
            <DialogDescription>
              {refundInfo?.isCard
                ? "Issues a refund to the original card via Stripe."
                : "Records a manual refund (tracked only — no electronic transfer)."}
            </DialogDescription>
          </DialogHeader>

          {refundLoading || !refundInfo ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <Row label="Total charged" value={formatCurrency(refundInfo.grossCents)} />
                {refundInfo.alreadyRefundedCents > 0 && (
                  <Row label="Already refunded" value={`-${formatCurrency(refundInfo.alreadyRefundedCents)}`} />
                )}
                <Row label="Remaining refundable" value={formatCurrency(refundInfo.remainingCents)} strong />
                {refundInfo.deductStripeFees && refundInfo.stripeFeesCents > 0 && (
                  <Row
                    label="Stripe fee withheld"
                    value={`-${formatCurrency(refundInfo.stripeFeesCents)}`}
                    muted
                  />
                )}
              </div>

              <div>
                <Label htmlFor="refund-amount">Refund amount</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="refund-amount"
                    inputMode="decimal"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="pl-7"
                  />
                </div>
                {refundInfo.deductStripeFees && refundInfo.stripeFeesCents > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Suggested {formatCurrency(refundInfo.suggestedCents)} (remaining minus Stripe fee).
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="refund-reason">Reason (optional)</Label>
                <Textarea
                  id="refund-reason"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Donor requested refund"
                  className="mt-1"
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRefundRow(null)} disabled={refundSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitRefund} disabled={refundSubmitting || refundLoading || !refundInfo}>
              {refundSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Processing…
                </>
              ) : (
                "Issue Refund"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : muted ? "text-muted-foreground" : ""}>{value}</span>
    </div>
  );
}
