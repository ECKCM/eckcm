"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";

interface Invoice {
  id: string;
  invoice_number: string;
  total_cents: number;
  status: string;
  issued_at: string;
  paid_at: string | null;
  registration_id: string;
  eckcm_registrations: {
    confirmation_code: string | null;
    eckcm_events: {
      name_en: string;
    };
  };
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  SUCCEEDED: "default",
  PENDING: "outline",
  FAILED: "destructive",
  REFUNDED: "destructive",
  PARTIALLY_REFUNDED: "secondary",
};

export function ReceiptList({ invoices }: { invoices: Invoice[] }) {
  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Receipts</h1>
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

          return (
            <Card key={inv.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">
                      {inv.invoice_number}
                    </CardTitle>
                  </div>
                  <Badge variant={statusVariant[inv.status] ?? "secondary"}>
                    {inv.status === "SUCCEEDED" ? "Paid" : inv.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Event</span>
                  <span>{event.name_en}</span>
                  {reg.confirmation_code && (
                    <>
                      <span className="text-muted-foreground">Code</span>
                      <span className="font-mono">{reg.confirmation_code}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium">
                    ${(inv.total_cents / 100).toFixed(2)}
                  </span>
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
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
