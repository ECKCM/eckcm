import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { logger } from "@/lib/logger";

/**
 * Calculate the total charge amount that covers Stripe card processing fees.
 * Card fee: 2.9% + $0.30
 */
function calcAmountWithFees(baseCents: number): number {
  return Math.ceil((baseCents + 30) / (1 - 0.029));
}

/**
 * Update PaymentIntent amount when user switches payment method inside PaymentElement.
 * - card/amazon_pay: restore original amount (with optional coversFees)
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { registrationId, paymentIntentId, selectedMethod, coversFees } = body;

  if (!registrationId || !paymentIntentId || !selectedMethod) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Load registration & verify ownership
  const { data: registration } = await supabase
    .from("eckcm_registrations")
    .select("id, created_by_user_id, event_id, registration_group_id")
    .eq("id", registrationId)
    .single();

  if (!registration) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }
  if (registration.created_by_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Load invoice
  const { data: invoice } = await admin
    .from("eckcm_invoices")
    .select("id, total_cents")
    .eq("registration_id", registrationId)
    .neq("status", "REFUNDED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Load event
  const { data: event } = await admin
    .from("eckcm_events")
    .select("stripe_mode, payment_test_mode")
    .eq("id", registration.event_id)
    .single();

  const stripeMode = (event?.stripe_mode as "test" | "live") ?? "test";
  const paymentTestMode = event?.payment_test_mode === true;
  const baseCents = paymentTestMode ? 100 : invoice.total_cents;

  // Compute new amount
  const newAmount = coversFees ? calcAmountWithFees(baseCents) : baseCents;

  // Update Stripe PaymentIntent
  const stripe = await getStripeForMode(stripeMode);
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (
      pi.status !== "requires_payment_method" &&
      pi.status !== "requires_confirmation" &&
      pi.status !== "requires_action"
    ) {
      return NextResponse.json(
        { error: `Payment is already ${pi.status}. Cannot update amount.` },
        { status: 409 }
      );
    }

    await stripe.paymentIntents.update(paymentIntentId, {
      amount: newAmount,
      metadata: {
        ...(pi.metadata || {}),
        selectedPaymentMethod: selectedMethod,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe error";
    // PI from different mode (test PI with live key or vice versa) — return amount without Stripe update
    if (msg.includes("a similar object exists in")) {
      logger.warn("[update-method-discount] PI mode mismatch, returning calculated amount", {
        paymentIntentId, stripeMode,
      });
      return NextResponse.json({ amount: newAmount, baseCents });
    }
    logger.error("[update-method-discount] Stripe update failed", { error: msg });
    return NextResponse.json(
      { error: `Failed to update payment amount: ${msg}` },
      { status: 500 }
    );
  }

  // Update DB payment record
  await admin
    .from("eckcm_payments")
    .update({ amount_cents: newAmount })
    .eq("stripe_payment_intent_id", paymentIntentId);

  return NextResponse.json({
    amount: newAmount,
    baseCents,
  });
}
