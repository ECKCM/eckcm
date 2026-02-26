import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRefundSummary } from "@/lib/services/refund.service";
import { requireAdmin } from "@/lib/auth/admin";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Get paymentId from query
  const url = new URL(request.url);
  const paymentId = url.searchParams.get("paymentId");

  if (!paymentId) {
    return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 4. Load payment
  const { data: payment } = await admin
    .from("eckcm_payments")
    .select("id, amount_cents, status, payment_method")
    .eq("id", paymentId)
    .single();

  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  // 5. Get refund summary
  const { totalRefundedCents, remainingCents, refunds } = await getRefundSummary(
    admin,
    payment.id,
    payment.amount_cents
  );

  // 6. Calculate Stripe processing fee if setting is enabled
  const { data: appConfig } = await admin
    .from("eckcm_app_config")
    .select("deduct_stripe_fees_on_refund")
    .eq("id", 1)
    .single();

  const deductFees = appConfig?.deduct_stripe_fees_on_refund ?? false;
  let stripeFeesCents = 0;

  if (deductFees && payment.payment_method !== "MANUAL" && payment.payment_method !== "ZELLE" && payment.payment_method !== "CHECK") {
    if (payment.payment_method === "ACH") {
      // ACH: 0.8%, capped at $5.00
      stripeFeesCents = Math.min(Math.round(payment.amount_cents * 0.008), 500);
    } else {
      // Card (default): 2.9% + $0.30
      stripeFeesCents = Math.round(payment.amount_cents * 0.029) + 30;
    }
  }

  const remainingAfterFeesCents = Math.max(0, remainingCents - stripeFeesCents);

  return NextResponse.json({
    paymentAmountCents: payment.amount_cents,
    paymentMethod: payment.payment_method,
    totalRefundedCents,
    remainingCents,
    deductStripeFees: deductFees,
    stripeFeesCents,
    remainingAfterFeesCents,
    refunds: refunds.map((r) => ({
      id: r.id,
      amountCents: r.amount_cents,
      reason: r.reason,
      stripeRefundId: r.stripe_refund_id,
      createdAt: r.created_at,
    })),
  });
}
