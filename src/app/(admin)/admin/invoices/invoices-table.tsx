"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime, useChangeDetector } from "@/lib/hooks/use-realtime";
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
import { MoreHorizontal, CreditCard, Loader2, Mail, FileText, Receipt, Download } from "lucide-react";
import { useTableSort } from "@/lib/hooks/use-table-sort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";

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

  // Live updates
  const _reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const _reload = () => {
    if (_reloadTimer.current) clearTimeout(_reloadTimer.current);
    _reloadTimer.current = setTimeout(loadInvoices, 500);
  };
  useRealtime({ table: "eckcm_invoices", event: "*" }, _reload);
  useRealtime({ table: "eckcm_payments", event: "*" }, _reload);
  useChangeDetector("eckcm_invoices", loadInvoices, 5000);

  const filtered = invoices.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      (inv.confirmation_code?.toLowerCase().includes(q) ?? false) ||
      (inv.registrant_email?.toLowerCase().includes(q) ?? false)
    );
  });

  const { sortedData: sorted, sortConfig, requestSort } = useTableSort(filtered);

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

  // --- Manual Payment ---
  const openManualPayDialog = (inv: InvoiceRow) => {
    setManualPayTarget(inv);
    setManualPayMethod(inv.payment_method ?? "MANUAL");
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

  const canManualPay = (inv: InvoiceRow) => inv.status === "PENDING";

  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  const handleSendEmail = async (inv: InvoiceRow, type: "confirmation" | "invoice" | "receipt") => {
    if (!inv.registration_id) {
      toast.error("No registration linked to this invoice");
      return;
    }
    setSendingEmail(inv.id);
    try {
      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: inv.registration_id, type }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send email");
      } else {
        const label = type === "confirmation" ? "Confirmation" : type === "receipt" ? "Receipt" : "Invoice";
        toast.success(`${label} email sent to ${inv.registrant_email}`);
      }
    } catch {
      toast.error("Network error");
    }
    setSendingEmail(null);
  };

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
            {sorted.length} invoice(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="invoice_number" sortConfig={sortConfig} onSort={requestSort}>Invoice #</SortableTableHead>
                  <SortableTableHead sortKey="confirmation_code" sortConfig={sortConfig} onSort={requestSort}>Code</SortableTableHead>
                  <SortableTableHead sortKey="registrant_email" sortConfig={sortConfig} onSort={requestSort}>Registrant</SortableTableHead>
                  <SortableTableHead sortKey="total_cents" sortConfig={sortConfig} onSort={requestSort}>Amount</SortableTableHead>
                  <SortableTableHead sortKey="payment_method" sortConfig={sortConfig} onSort={requestSort}>Method</SortableTableHead>
                  <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={requestSort}>Status</SortableTableHead>
                  <SortableTableHead sortKey="issued_at" sortConfig={sortConfig} onSort={requestSort}>Issued</SortableTableHead>
                  <SortableTableHead sortKey="paid_at" sortConfig={sortConfig} onSort={requestSort}>Paid</SortableTableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((inv) => (
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
                      {(canManualPay(inv) || inv.registration_id) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              {sendingEmail === inv.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="size-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canManualPay(inv) && (
                              <DropdownMenuItem onClick={() => openManualPayDialog(inv)}>
                                <CreditCard className="mr-2 size-4" />
                                Record Payment
                              </DropdownMenuItem>
                            )}
                            {inv.registration_id && inv.status === "SUCCEEDED" && (
                              <DropdownMenuItem onClick={() => handleSendEmail(inv, "confirmation")}>
                                <Mail className="mr-2 size-4" />
                                Send Confirmation
                              </DropdownMenuItem>
                            )}
                            {inv.registration_id && (
                              <DropdownMenuItem onClick={() => handleSendEmail(inv, "invoice")}>
                                <FileText className="mr-2 size-4" />
                                Send Invoice Email
                              </DropdownMenuItem>
                            )}
                            {inv.registration_id && inv.status === "SUCCEEDED" && (
                              <DropdownMenuItem onClick={() => handleSendEmail(inv, "receipt")}>
                                <Receipt className="mr-2 size-4" />
                                Send Receipt Email
                              </DropdownMenuItem>
                            )}
                            {inv.registration_id && (
                              <DropdownMenuItem asChild>
                                <a href={`/api/invoice/${inv.id}/pdf?type=invoice`} download>
                                  <Download className="mr-2 size-4" />
                                  Download Invoice PDF
                                </a>
                              </DropdownMenuItem>
                            )}
                            {inv.registration_id && inv.status === "SUCCEEDED" && (
                              <DropdownMenuItem asChild>
                                <a href={`/api/invoice/${inv.id}/pdf?type=receipt`} download>
                                  <Download className="mr-2 size-4" />
                                  Download Receipt PDF
                                </a>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {sorted.length === 0 && (
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
            </>
          )}
        </CardContent>
      </Card>

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
