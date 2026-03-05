"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Download } from "lucide-react";

interface LineItem {
  description_en: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  total_cents: number;
  status: string;
  issued_at: string;
  paid_at: string | null;
  registration_id: string;
  eckcm_invoice_line_items: LineItem[];
  eckcm_registrations: {
    confirmation_code: string | null;
    eckcm_events: {
      name_en: string;
    };
  };
  eckcm_payments: { payment_method: string; status: string }[];
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  SUCCEEDED: "default",
  PENDING: "outline",
  FAILED: "destructive",
  REFUNDED: "destructive",
  PARTIALLY_REFUNDED: "secondary",
};

function statusLabel(status: string) {
  if (status === "SUCCEEDED") return "Paid";
  if (status === "PENDING") return "Pending";
  return status;
}

export function ReceiptList({ invoices }: { invoices: Invoice[] }) {
  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Receipts & Invoices</h1>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No receipts yet.
          </CardContent>
        </Card>
      ) : (
        invoices.map((inv) => {
          const reg = inv.eckcm_registrations;
          const event = reg.eckcm_events;
          const isPaid = inv.status === "SUCCEEDED";
          const docType = isPaid ? "Receipt" : "Invoice";
          const payment = inv.eckcm_payments?.find(
            (p) => p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED"
          );
          const lineItems = inv.eckcm_invoice_line_items ?? [];

          return (
            <Card key={inv.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">
                      {inv.invoice_number}
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {docType}
                    </span>
                  </div>
                  <Badge variant={statusVariant[inv.status] ?? "secondary"}>
                    {statusLabel(inv.status)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Event</span>
                  <span>{event.name_en}</span>
                  {reg.confirmation_code && (
                    <>
                      <span className="text-muted-foreground">Code</span>
                      <span className="font-mono">{reg.confirmation_code}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">Issued</span>
                  <span>
                    {new Date(inv.issued_at).toLocaleDateString("en-US")}
                  </span>
                  {inv.paid_at && (
                    <>
                      <span className="text-muted-foreground">Paid</span>
                      <span>
                        {new Date(inv.paid_at).toLocaleDateString("en-US")}
                      </span>
                    </>
                  )}
                  {payment && (
                    <>
                      <span className="text-muted-foreground">Method</span>
                      <span>{payment.payment_method}</span>
                    </>
                  )}
                </div>

                {/* Line items */}
                {lineItems.length > 0 && (
                  <div className="rounded-md border text-sm">
                    <div className="grid grid-cols-[1fr_2.5rem_5rem_5.5rem] gap-x-2 px-3 py-2 bg-muted/50 text-xs text-muted-foreground font-medium">
                      <span>Description</span>
                      <span className="text-right">Qty</span>
                      <span className="text-right">Unit</span>
                      <span className="text-right">Amount</span>
                    </div>
                    {lineItems.map((li, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[1fr_2.5rem_5rem_5.5rem] gap-x-2 px-3 py-2 border-t"
                      >
                        <span>{li.description_en}</span>
                        <span className="text-right">{li.quantity}</span>
                        <span className="text-right">
                          ${(li.unit_price_cents / 100).toFixed(2)}
                        </span>
                        <span className="text-right">
                          ${(li.total_cents / 100).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    <div className="grid grid-cols-[1fr_2.5rem_5rem_5.5rem] gap-x-2 px-3 py-2 border-t font-medium">
                      <span />
                      <span />
                      <span className="text-right">Total</span>
                      <span className="text-right">${(inv.total_cents / 100).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Download */}
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`/api/invoice/${inv.id}/pdf`}
                      download={`eckcm-${isPaid ? "receipt" : "invoice"}-${inv.invoice_number}.pdf`}
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Download {docType} PDF
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
