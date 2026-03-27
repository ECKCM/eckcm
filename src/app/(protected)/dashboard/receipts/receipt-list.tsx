"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, FileText, Receipt } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

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
    registration_type: string | null;
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

function useStatusLabel() {
  const { t } = useI18n();
  return (status: string) => {
    if (status === "SUCCEEDED") return t("receipts.paid");
    if (status === "PENDING") return t("receipts.pending");
    return status;
  };
}

function InvoiceCard({ inv }: { inv: Invoice }) {
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const reg = inv.eckcm_registrations;
  const event = reg.eckcm_events;
  const isPaid = inv.status === "SUCCEEDED";
  const docType = isPaid ? t("receipts.receipt") : t("receipts.invoice");
  const payment = inv.eckcm_payments?.find(
    (p) => p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED"
  );
  const lineItems = inv.eckcm_invoice_line_items ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPaid ? (
              <Receipt className="h-4 w-4 text-muted-foreground" />
            ) : (
              <FileText className="h-4 w-4 text-muted-foreground" />
            )}
            <CardTitle className="text-base">{docType}</CardTitle>
          </div>
          <Badge variant={statusVariant[inv.status] ?? "secondary"}>
            {statusLabel(inv.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-2 text-sm overflow-x-auto">
          <span className="text-muted-foreground">{t("receipts.invoiceNum")}</span>
          <span className="font-mono">{inv.invoice_number}</span>
          {isPaid && (
            <>
              <span className="text-muted-foreground">{t("receipts.receiptNum")}</span>
              <span className="font-mono">{inv.invoice_number.replace(/^INV-/, "RCT-")}</span>
            </>
          )}
          <span className="text-muted-foreground">{t("receipts.event")}</span>
          <span>{event.name_en}</span>
          {reg.confirmation_code && (
            <>
              <span className="text-muted-foreground">{t("receipts.code")}</span>
              <span className="font-mono">{reg.confirmation_code}</span>
            </>
          )}
          <span className="text-muted-foreground">{t("receipts.issued")}</span>
          <span>
            {new Date(inv.issued_at).toLocaleDateString("en-US")}
          </span>
          {inv.paid_at && (
            <>
              <span className="text-muted-foreground">{t("receipts.paidDate")}</span>
              <span>
                {new Date(inv.paid_at).toLocaleDateString("en-US")}
              </span>
            </>
          )}
          {payment && (
            <>
              <span className="text-muted-foreground">{t("receipts.method")}</span>
              <span>{payment.payment_method}</span>
            </>
          )}
        </div>

        {/* Line items */}
        {lineItems.length > 0 && (
          <div className="overflow-x-auto">
            <div className="min-w-[24rem] rounded-md border text-sm">
              <div className="grid grid-cols-[1fr_2.5rem_5rem_5.5rem] gap-x-2 px-3 py-2 bg-muted/50 text-xs text-muted-foreground font-medium">
                <span>{t("receipts.description")}</span>
                <span className="text-right">{t("receipts.qty")}</span>
                <span className="text-right">{t("receipts.unit")}</span>
                <span className="text-right">{t("receipts.amount")}</span>
              </div>
              {lineItems.map((li, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-[1fr_2.5rem_5rem_5.5rem] gap-x-2 px-3 py-2 border-t ${li.total_cents === 0 ? "text-green-600" : ""}`}
                >
                  <span className="truncate">{li.description_en}</span>
                  <span className="text-right">{li.quantity}</span>
                  <span className="text-right">
                    {li.total_cents === 0 ? t("common.free") : `$${(li.unit_price_cents / 100).toFixed(2)}`}
                  </span>
                  <span className="text-right">
                    {li.total_cents === 0 ? t("common.free") : `$${(li.total_cents / 100).toFixed(2)}`}
                  </span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_2.5rem_5rem_5.5rem] gap-x-2 px-3 py-2 border-t font-medium">
                <span />
                <span />
                <span className="text-right">{t("common.total")}</span>
                <span className="text-right">${(inv.total_cents / 100).toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Download */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/api/invoice/${inv.id}/pdf?type=invoice`}
              download={`eckcm-invoice-${inv.invoice_number}.pdf`}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              {t("receipts.invoicePdf")}
            </a>
          </Button>
          {isPaid && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/api/invoice/${inv.id}/pdf?type=receipt`}
                download={`eckcm-receipt-${inv.invoice_number}.pdf`}
              >
                <Receipt className="mr-1.5 h-3.5 w-3.5" />
                {t("receipts.receiptPdf")}
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InvoiceList({ invoices }: { invoices: Invoice[] }) {
  const { t } = useI18n();
  if (invoices.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t("registrations.noRegistrations")}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {invoices.map((inv) => (
        <InvoiceCard key={inv.id} inv={inv} />
      ))}
    </div>
  );
}

export function ReceiptList({ invoices }: { invoices: Invoice[] }) {
  const { t } = useI18n();
  const myInvoices = invoices.filter(
    (inv) => inv.eckcm_registrations.registration_type !== "others"
  );
  const othersInvoices = invoices.filter(
    (inv) => inv.eckcm_registrations.registration_type === "others"
  );
  const hasBothTabs = othersInvoices.length > 0;

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t("receipts.title")}</h1>
      </div>

      {!hasBothTabs ? (
        <InvoiceList invoices={invoices} />
      ) : (
        <Tabs defaultValue="my">
          <TabsList className="w-full">
            <TabsTrigger value="my" className="flex-1">
              {t("receipts.myRegistration", { count: myInvoices.length })}
            </TabsTrigger>
            <TabsTrigger value="others" className="flex-1">
              {t("receipts.registeredForOthers", { count: othersInvoices.length })}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="my" className="mt-4">
            <InvoiceList invoices={myInvoices} />
          </TabsContent>
          <TabsContent value="others" className="mt-4">
            <InvoiceList invoices={othersInvoices} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
