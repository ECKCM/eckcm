"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MoreHorizontal, RotateCcw, CreditCard, Loader2 } from "lucide-react";

interface Event {
  id: string;
  name_en: string;
  year: number;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  total_cents: number;
  status: string;
  issued_at: string;
  paid_at: string | null;
  confirmation_code: string | null;
  registrant_email: string | null;
  payment_id: string | null;
  payment_method: string | null;
  payment_amount_cents: number | null;
  registration_id: string | null;
}

export function InvoicesTable({ events }: { events: Event[] }) {
  const [mounted, setMounted] = useState(false);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Refund dialog state
  const [refundTarget, setRefundTarget] = useState<InvoiceRow | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [refunding, setRefunding] = useState(false);
  const [refundInfo, setRefundInfo] = useState<{
    paymentAmountCents: number;
    paymentMethod?: string;
    totalRefundedCents: number;
    remainingCents: number;
    deductStripeFees?: boolean;
    stripeFeesCents?: number;
    remainingAfterFeesCents?: number;
    refunds: Array<{
      id: string;
      amountCents: number;
      reason: string | null;
      stripeRefundId: string | null;
      createdAt: string;
    }>;
  } | null>(null);
  const [loadingRefundInfo, setLoadingRefundInfo] = useState(false);

  // Manual payment dialog state
  const [manualPayTarget, setManualPayTarget] = useState<InvoiceRow | null>(null);
  const [manualPayMethod, setManualPayMethod] = useState("MANUAL");
  const [manualPayNote, setManualPayNote] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const loadInvoices = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("eckcm_invoices")
      .select(`
        id,
        invoice_number,
        total_cents,
        status,
        issued_at,
        paid_at,
        registration_id,
        eckcm_registrations!inner(
          confirmation_code,
          event_id,
          eckcm_users:created_by_user_id(email)
        ),
        eckcm_payments(id, payment_method, amount_cents, status)
      `)
      .eq("eckcm_registrations.event_id", eventId)
      .order("issued_at", { ascending: false });

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: InvoiceRow[] = data.map((inv: any) => {
        const successPayment = inv.eckcm_payments?.find(
          (p: { status: string }) => p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED"
        );
        const anyPayment = inv.eckcm_payments?.[0];
        const payment = successPayment || anyPayment;

        return {
          id: inv.id,
          invoice_number: inv.invoice_number,
          total_cents: inv.total_cents,
          status: inv.status,
          issued_at: inv.issued_at,
          paid_at: inv.paid_at,
          confirmation_code: inv.eckcm_registrations?.confirmation_code,
          registrant_email: inv.eckcm_registrations?.eckcm_users?.email ?? null,
          payment_id: payment?.id ?? null,
          payment_method: payment?.payment_method ?? null,
          payment_amount_cents: payment?.amount_cents ?? null,
          registration_id: inv.registration_id,
        };
      });
      setInvoices(rows);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const filtered = invoices.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      (inv.confirmation_code?.toLowerCase().includes(q) ?? false) ||
      (inv.registrant_email?.toLowerCase().includes(q) ?? false)
    );
  });

  const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    SUCCEEDED: "default",
    PENDING: "outline",
    FAILED: "destructive",
    REFUNDED: "destructive",
    PARTIALLY_REFUNDED: "secondary",
  };

  const statusLabel: Record<string, string> = {
    SUCCEEDED: "Paid",
    PENDING: "Pending",
    FAILED: "Failed",
    REFUNDED: "Refunded",
    PARTIALLY_REFUNDED: "Partial Refund",
  };

  // --- Refund ---
  const openRefundDialog = async (inv: InvoiceRow) => {
    setRefundTarget(inv);
    setRefundType("full");
    setRefundReason("");
    setRefundInfo(null);
    setLoadingRefundInfo(true);

    let paymentId = inv.payment_id;

    // If no payment record exists, auto-sync from Stripe first
    if (!paymentId) {
      try {
        const syncRes = await fetch("/api/admin/stripe-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId }),
        });
        if (syncRes.ok) {
          const syncData = await syncRes.json();
          if (syncData.synced > 0) {
            // Reload invoices to get the new payment_id
            await loadInvoices();
            // Find the updated invoice
            const supabase = createClient();
            const { data: payments } = await supabase
              .from("eckcm_payments")
              .select("id")
              .eq("invoice_id", inv.id)
              .limit(1);
            paymentId = payments?.[0]?.id ?? null;
            if (paymentId) {
              // Update the target with the new payment_id
              inv = { ...inv, payment_id: paymentId };
              setRefundTarget(inv);
            }
          }
        }
      } catch {
        // Sync failed, continue without it
      }
    }

    if (!paymentId) {
      setLoadingRefundInfo(false);
      toast.error("No payment record found. Cannot issue refund.");
      setRefundTarget(null);
      return;
    }

    try {
      const res = await fetch(`/api/admin/refund/info?paymentId=${paymentId}`);
      if (res.ok) {
        const data = await res.json();
        setRefundInfo(data);
        // Use fee-adjusted amount if deducting fees, otherwise full remaining
        const defaultAmount = data.deductStripeFees
          ? data.remainingAfterFeesCents
          : data.remainingCents;
        setRefundAmount((defaultAmount / 100).toFixed(2));
      } else {
        setRefundAmount(((inv.payment_amount_cents ?? inv.total_cents) / 100).toFixed(2));
      }
    } catch {
      setRefundAmount(((inv.payment_amount_cents ?? inv.total_cents) / 100).toFixed(2));
    }
    setLoadingRefundInfo(false);
  };

  const handleRefund = async () => {
    if (!refundTarget?.payment_id) {
      toast.error("No payment record found. Cannot issue refund.");
      return;
    }

    // Validate remaining balance exists
    if (refundInfo && refundInfo.remainingCents <= 0) {
      toast.error("This payment has already been fully refunded.");
      return;
    }

    setRefunding(true);

    const maxRefundable = refundInfo
      ? (refundInfo.deductStripeFees
          ? (refundInfo.remainingAfterFeesCents ?? refundInfo.remainingCents)
          : refundInfo.remainingCents)
      : Infinity;

    const amountCents = refundType === "full"
      ? undefined
      : Math.round(parseFloat(refundAmount) * 100);

    if (refundType === "partial") {
      if (!amountCents || !Number.isFinite(amountCents) || amountCents <= 0) {
        toast.error("Enter a valid refund amount");
        setRefunding(false);
        return;
      }
      if (amountCents > maxRefundable) {
        toast.error(
          `Amount exceeds maximum refundable: $${(maxRefundable / 100).toFixed(2)}`
        );
        setRefunding(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/admin/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: refundTarget.payment_id,
          amountCents,
          reason: refundReason || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Refund failed");
      } else {
        toast.success(
          `Refund of $${((data.amountCents ?? 0) / 100).toFixed(2)} issued successfully`
        );
        loadInvoices();
      }
    } catch {
      toast.error("Network error");
    }

    setRefunding(false);
    setRefundTarget(null);
  };

  // --- Manual Payment ---
  const openManualPayDialog = (inv: InvoiceRow) => {
    setManualPayTarget(inv);
    setManualPayMethod("MANUAL");
    setManualPayNote("");
  };

  const handleManualPay = async () => {
    if (!manualPayTarget) return;
    setPaying(true);

    try {
      const res = await fetch("/api/admin/payment/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: manualPayTarget.id,
          paymentMethod: manualPayMethod,
          note: manualPayNote || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Payment recording failed");
      } else {
        toast.success("Payment recorded successfully");
        loadInvoices();
      }
    } catch {
      toast.error("Network error");
    }

    setPaying(false);
    setManualPayTarget(null);
  };

  const canRefund = (inv: InvoiceRow) =>
    inv.status === "SUCCEEDED" || inv.status === "PARTIALLY_REFUNDED";

  const canManualPay = (inv: InvoiceRow) => inv.status === "PENDING";

  if (!mounted) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Invoices</h1>

      <div className="flex gap-3">
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Select event" />
          </SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name_en} ({e.year})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Search invoice#, code, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {filtered.length} invoice(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Registrant</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-sm">
                      {inv.invoice_number}
                    </TableCell>
                    <TableCell className="font-mono">
                      {inv.confirmation_code ?? "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {inv.registrant_email ?? "-"}
                    </TableCell>
                    <TableCell className="font-medium">
                      ${((inv.payment_amount_cents ?? inv.total_cents) / 100).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {inv.payment_method ?? "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[inv.status] ?? "secondary"}>
                        {statusLabel[inv.status] ?? inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(inv.issued_at).toLocaleDateString("en-US")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {inv.paid_at
                        ? new Date(inv.paid_at).toLocaleDateString("en-US")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {(canRefund(inv) || canManualPay(inv)) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canRefund(inv) && (
                              <DropdownMenuItem onClick={() => openRefundDialog(inv)}>
                                <RotateCcw className="mr-2 size-4" />
                                Refund
                              </DropdownMenuItem>
                            )}
                            {canManualPay(inv) && (
                              <DropdownMenuItem onClick={() => openManualPayDialog(inv)}>
                                <CreditCard className="mr-2 size-4" />
                                Record Payment
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center text-muted-foreground py-8"
                    >
                      No invoices found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Refund Dialog */}
      <Dialog open={!!refundTarget} onOpenChange={(open) => !open && setRefundTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Refund</DialogTitle>
            <DialogDescription>
              Invoice {refundTarget?.invoice_number}
            </DialogDescription>
          </DialogHeader>

          {loadingRefundInfo ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : refundInfo && refundInfo.remainingCents <= 0 ? (
            <div className="space-y-4">
              {/* Fully refunded — no further refunds possible */}
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm space-y-2">
                <p className="font-medium text-destructive">Fully Refunded</p>
                <p className="text-muted-foreground">
                  This payment of ${(refundInfo.paymentAmountCents / 100).toFixed(2)} has been fully refunded.
                  No further refunds can be issued.
                </p>
              </div>
              {refundInfo.refunds.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Refund History</Label>
                  <div className="rounded-md border divide-y text-sm">
                    {refundInfo.refunds.map((r) => (
                      <div key={r.id} className="flex justify-between px-3 py-1.5">
                        <span className="text-muted-foreground">
                          {new Date(r.createdAt).toLocaleDateString("en-US")}
                          {r.reason && ` - ${r.reason}`}
                        </span>
                        <span className="font-medium">-${(r.amountCents / 100).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Payment summary */}
              {refundInfo && (
                <div className="rounded-md border p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payment</span>
                    <span className="font-medium">${(refundInfo.paymentAmountCents / 100).toFixed(2)}</span>
                  </div>
                  {refundInfo.totalRefundedCents > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>Already Refunded</span>
                      <span>-${(refundInfo.totalRefundedCents / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium border-t pt-1">
                    <span>Remaining</span>
                    <span>${(refundInfo.remainingCents / 100).toFixed(2)}</span>
                  </div>
                  {refundInfo.deductStripeFees && (refundInfo.stripeFeesCents ?? 0) > 0 && (
                    <>
                      <div className="flex justify-between text-orange-600">
                        <span>Stripe Fee ({refundInfo.paymentMethod === "ACH" ? "0.8%" : "2.9% + $0.30"})</span>
                        <span>-${((refundInfo.stripeFeesCents ?? 0) / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t pt-1">
                        <span>Refundable</span>
                        <span>${((refundInfo.remainingAfterFeesCents ?? refundInfo.remainingCents) / 100).toFixed(2)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Previous refund history */}
              {refundInfo && refundInfo.refunds.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Previous Refunds</Label>
                  <div className="rounded-md border divide-y text-sm">
                    {refundInfo.refunds.map((r) => (
                      <div key={r.id} className="flex justify-between px-3 py-1.5">
                        <span className="text-muted-foreground">
                          {new Date(r.createdAt).toLocaleDateString("en-US")}
                          {r.reason && ` - ${r.reason}`}
                        </span>
                        <span className="font-medium">-${(r.amountCents / 100).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label>Refund Type</Label>
                <Select value={refundType} onValueChange={(v) => setRefundType(v as "full" | "partial")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">
                      Full Refund (${(refundInfo
                        ? (refundInfo.deductStripeFees ? (refundInfo.remainingAfterFeesCents ?? refundInfo.remainingCents) : refundInfo.remainingCents) / 100
                        : (refundTarget?.payment_amount_cents ?? 0) / 100).toFixed(2)})
                    </SelectItem>
                    <SelectItem value="partial">Partial Refund</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {refundType === "partial" && (
                <div className="space-y-1">
                  <Label>Amount ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={(refundInfo
                      ? (refundInfo.deductStripeFees ? (refundInfo.remainingAfterFeesCents ?? refundInfo.remainingCents) : refundInfo.remainingCents) / 100
                      : (refundTarget?.payment_amount_cents ?? 0) / 100).toFixed(2)}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label>Reason (optional)</Label>
                <Textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g., Customer requested cancellation"
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundTarget(null)}>
              {refundInfo && refundInfo.remainingCents <= 0 ? "Close" : "Cancel"}
            </Button>
            {(!refundInfo || refundInfo.remainingCents > 0) && (
              <Button
                variant="destructive"
                onClick={handleRefund}
                disabled={refunding || loadingRefundInfo}
              >
                {refunding ? "Processing..." : "Issue Refund"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Payment Dialog */}
      <Dialog open={!!manualPayTarget} onOpenChange={(open) => !open && setManualPayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Manual Payment</DialogTitle>
            <DialogDescription>
              Invoice {manualPayTarget?.invoice_number} &middot; ${((manualPayTarget?.total_cents ?? 0) / 100).toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Payment Method</Label>
              <Select value={manualPayMethod} onValueChange={setManualPayMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANUAL">Manual / Cash</SelectItem>
                  <SelectItem value="CHECK">Check</SelectItem>
                  <SelectItem value="ZELLE">Zelle</SelectItem>
                  <SelectItem value="ACH">ACH Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Textarea
                value={manualPayNote}
                onChange={(e) => setManualPayNote(e.target.value)}
                placeholder="e.g., Cash received at front desk"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualPayTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleManualPay} disabled={paying}>
              {paying ? "Processing..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
