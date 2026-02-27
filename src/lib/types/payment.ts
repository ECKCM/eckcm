import type { PaymentStatus, PaymentMethod } from "./database";

/**
 * Payment record from eckcm_payments table
 */
export interface Payment {
  id: string;
  invoice_id: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  cover_fees: boolean;
  fee_amount_cents: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Refund record from eckcm_refunds table
 */
export interface Refund {
  id: string;
  payment_id: string;
  stripe_refund_id: string | null;
  amount_cents: number;
  reason: string | null;
  refunded_by: string;
  created_at: string;
}

/**
 * Invoice record from eckcm_invoices table
 */
export interface Invoice {
  id: string;
  registration_id: string;
  invoice_number: string;
  subtotal_cents: number;
  total_cents: number;
  status: "DRAFT" | "SENT" | "PAID" | "VOID";
  created_at: string;
  updated_at: string;
}

/**
 * Invoice line item from eckcm_invoice_line_items table
 */
export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  description: string;
  description_ko: string | null;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  fee_category_id: string | null;
}

/**
 * Payment intent creation request
 */
export interface CreatePaymentIntentRequest {
  registrationId: string;
  coverFees: boolean;
}

/**
 * Payment intent creation response
 */
export interface CreatePaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  feeAmount: number;
}

/**
 * Zelle payment submission request
 */
export interface ZelleSubmitRequest {
  registrationId: string;
  referenceNote: string;
}
