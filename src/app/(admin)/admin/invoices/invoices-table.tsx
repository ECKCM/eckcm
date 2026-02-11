"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";

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
}

export function InvoicesTable({ events }: { events: Event[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadInvoices = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("ECKCM_invoices")
      .select(`
        id,
        invoice_number,
        total_cents,
        status,
        issued_at,
        paid_at,
        ECKCM_registrations!inner(
          confirmation_code,
          event_id,
          ECKCM_users:created_by_user_id(email)
        )
      `)
      .eq("ECKCM_registrations.event_id", eventId)
      .order("issued_at", { ascending: false });

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: InvoiceRow[] = data.map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        total_cents: inv.total_cents,
        status: inv.status,
        issued_at: inv.issued_at,
        paid_at: inv.paid_at,
        confirmation_code: inv.ECKCM_registrations?.confirmation_code,
        registrant_email: inv.ECKCM_registrations?.ECKCM_users?.email ?? null,
      }));
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
  };

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
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Paid</TableHead>
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
                      ${(inv.total_cents / 100).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[inv.status] ?? "secondary"}>
                        {inv.status === "SUCCEEDED" ? "Paid" : inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(inv.issued_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {inv.paid_at
                        ? new Date(inv.paid_at).toLocaleDateString()
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
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
    </div>
  );
}
