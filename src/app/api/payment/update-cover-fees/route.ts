import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";

/**
 * Calculate the total charge amount that covers Stripe processing fees.
 * Card fee: 2.9% + $0.30
 * Formula: chargeAmount = ceil((baseCents + 30) / (1 - 0.029))
 */
function calcAmountWithFees(baseCents: number): number {
  return Math.ceil((baseCents + 30) / (1 - 0.029));
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { registrationId, coversFees, paymentIntentId } = body;

  if (!registrationId || typeof coversFees !== "boolean") {
    return NextResponse.json(
      { error: "Missing registrationId or coversFees" },
      { status: 400 }
    );
  }

  // Load registration
  const { data: registration } = await supabase
    .from("eckcm_registrations")
    .select("id, created_by_user_id, event_id")
    .eq("id", registrationId)
    .single();

  if (!registration) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  if (registration.created_by_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Load invoice (latest non-refunded)
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

  // Load event stripe_mode and payment_test_mode
  const { data: event } = await admin
    .from("eckcm_events")
    .select("stripe_mode, payment_test_mode")
    .eq("id", registration.event_id)
    .single();

  const stripeMode = (event?.stripe_mode as "test" | "live") ?? "test";
  const paymentTestMode = event?.payment_test_mode === true;

  const baseCents = paymentTestMode ? 100 : invoice.total_cents;
  const newAmount = coversFees ? calcAmountWithFees(baseCents) : baseCents;
  const feeCents = coversFees ? newAmount - baseCents : 0;

  // Resolve Stripe PaymentIntent ID:
  // 1. Use frontend-provided paymentIntentId (most reliable — extracted from clientSecret)
  // 2. Fallback: look up from DB
  let stripePI: string | null = null;

  if (paymentIntentId && typeof paymentIntentId === "string") {
    stripePI = paymentIntentId;
  } else {
    // Fallback: find from DB (any status — the PI might still be modifiable even if DB status changed)
    const { data: existingPayment } = await admin
      .from("eckcm_payments")
      .select("stripe_payment_intent_id")
      .eq("invoice_id", invoice.id)
      .not("stripe_payment_intent_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    stripePI = existingPayment?.stripe_payment_intent_id ?? null;
  }

  if (!stripePI) {
    return NextResponse.json(
      { error: "No Stripe payment found. Please refresh the page and try again." },
      { status: 404 }
    );
  }

  // Update Stripe PaymentIntent amount
  const stripe = await getStripeForMode(stripeMode);
  try {
    const pi = await stripe.paymentIntents.retrieve(stripePI);
    // Only update if the PI is still in a modifiable state
    if (
      pi.status !== "requires_payment_method" &&
      pi.status !== "requires_confirmation" &&
      pi.status !== "requires_action"
    ) {
      return NextResponse.json(
        { error: `Payment is already ${pi.status}. Cannot update fee coverage.` },
        { status: 409 }
      );
    }

    await stripe.paymentIntents.update(stripePI, {
      amount: newAmount,
      metadata: { coversFees: coversFees ? "true" : "false" },
    });
  } catch (err) {
    console.error("[update-cover-fees] Stripe update failed:", err);
    const msg = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json(
      { error: `Failed to update payment amount: ${msg}` },
      { status: 500 }
    );
  }

  // Update payment record amount (best effort — use any status since webhook may have changed it)
  await admin
    .from("eckcm_payments")
    .update({ amount_cents: newAmount })
    .eq("stripe_payment_intent_id", stripePI);

  return NextResponse.json({
    amount: newAmount,
    baseCents,
    feeCents,
    coversFees,
  });
}
