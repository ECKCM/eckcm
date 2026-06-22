import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { customPaymentCreateIntentSchema } from "@/lib/schemas/api";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    // Rate limit by IP (no user context for public custom payments)
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rl = rateLimit(`custom-payment-intent:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = customPaymentCreateIntentSchema.safeParse(
      await request.json()
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { amountCents, payerName, payerEmail, purpose, coversFees } =
      parsed.data;

    const admin = createAdminClient();

    // Get stripe mode from active event (fallback to test)
    const { data: event } = await admin
      .from("eckcm_events")
      .select("stripe_mode")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const stripeMode = (event?.stripe_mode as "test" | "live") ?? "test";

    // Fetch the publishable key matching the Stripe mode so the client can
    // initialize Stripe.js in the SAME mode the PaymentIntent is created in.
    const { data: appConfig } = await admin
      .from("eckcm_app_config")
      .select("stripe_test_publishable_key, stripe_live_publishable_key")
      .eq("id", 1)
      .single();
    const publishableKey =
      (appConfig as Record<string, string | null> | null)?.[
        stripeMode === "live"
          ? "stripe_live_publishable_key"
          : "stripe_test_publishable_key"
      ] ||
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
      null;

    // Calculate charge amount with optional fee coverage (2.9% + $0.30)
    const chargeAmount = coversFees
      ? Math.ceil((amountCents + 30) / (1 - 0.029))
      : amountCents;
    const feeCents = coversFees ? chargeAmount - amountCents : 0;

    const stripe = await getStripeForMode(stripeMode);

    // Find or create Stripe Customer if email provided
    let stripeCustomerId: string | undefined;
    if (payerEmail) {
      const existing = await stripe.customers.list({
        email: payerEmail,
        limit: 1,
      });
      if (existing.data.length > 0) {
        stripeCustomerId = existing.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: payerEmail,
          name: payerName || undefined,
        });
        stripeCustomerId = customer.id;
      }
    }

    // Create the custom payment record first to get the ID for metadata
    const { data: payment, error: insertError } = await admin
      .from("eckcm_custom_payments")
      .insert({
        payer_name: payerName || null,
        payer_email: payerEmail || null,
        purpose: purpose || null,
        amount_cents: amountCents,
        fee_cents: feeCents,
        covers_fees: !!coversFees,
        payment_method: "CARD",
        status: "PENDING",
        metadata: {},
      })
      .select("id")
      .single();

    if (insertError || !payment) {
      logger.error("[custom-payment/create-intent] Failed to insert payment", {
        error: insertError?.message ?? "no data returned",
      });
      return NextResponse.json(
        { error: "Failed to create payment record" },
        { status: 500 }
      );
    }

    // Create Stripe PaymentIntent
    const description = purpose
      ? `ECKCM Payment — ${purpose}`
      : "ECKCM Payment";

    const paymentIntent = await stripe.paymentIntents.create({
      amount: chargeAmount,
      currency: "usd",
      description,
      statement_descriptor_suffix: "PAYMENT",
      ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
      receipt_email: payerEmail || undefined,
      metadata: {
        customPaymentId: payment.id,
        type: "custom_payment",
        coversFees: coversFees ? "true" : "false",
        ...(purpose ? { purpose } : {}),
      },
      payment_method_configuration:
        stripeMode === "live"
          ? "pmc_1TIYrzAHIcy4RD4RUlTrBtlE"
          : "pmc_1TIYtSAHIcy4RD4R0iMHaWJu",
    });

    // Update payment with Stripe PI ID
    await admin
      .from("eckcm_custom_payments")
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentId: payment.id,
      chargeAmount,
      feeCents,
      publishableKey,
    });
  } catch (err) {
    logger.error("[custom-payment/create-intent] Unhandled error", {
      error: String(err),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
