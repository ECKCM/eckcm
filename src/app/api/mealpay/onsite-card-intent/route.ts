import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { mealpayOnsiteCardIntentSchema } from "@/lib/schemas/api";
import {
  getMealUnitPriceCents,
  applyFeeCoverage,
} from "@/lib/services/meal-pass.service";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Physical meal-pass purchase paid ONLINE by card (multi-tier). Mirrors
 * /api/mealpay/onsite-submit (records an aggregate `meal_pass_onsite_request`
 * for the desk to hand out pre-printed cards) but charges the buyer now via
 * Stripe instead of at the desk. NO eckcm_meal_passes / on-screen QR is created.
 *
 * The PaymentIntent is tagged `type:"custom_payment"` so the SAME webhook +
 * /api/custom-payment/confirm path flips the row PENDING → SUCCEEDED. Once
 * SUCCEEDED it surfaces in /admin/meal-passes as an APPROVED (paid) request.
 */
export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rl = rateLimit(`mealpay-onsite-card:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = mealpayOnsiteCardIntentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { eventId, general, youth, payerName, payerEmail, payerPhone, churchName, coversFees } =
      parsed.data;

    const admin = createAdminClient();

    // Resolve per-meal prices server-side (never trust the client).
    const [generalPrice, youthPrice] = await Promise.all([
      general > 0 ? getMealUnitPriceCents(admin, "MEAL_GENERAL") : Promise.resolve(0),
      youth > 0 ? getMealUnitPriceCents(admin, "MEAL_YOUTH") : Promise.resolve(0),
    ]);
    if ((general > 0 && generalPrice == null) || (youth > 0 && youthPrice == null)) {
      return NextResponse.json(
        { error: "Meal pricing is not configured for a selected tier" },
        { status: 400 }
      );
    }

    const items = [
      general > 0
        ? { tierCode: "MEAL_GENERAL", quantity: general, unitCents: generalPrice ?? 0 }
        : null,
      youth > 0
        ? { tierCode: "MEAL_YOUTH", quantity: youth, unitCents: youthPrice ?? 0 }
        : null,
    ].filter(Boolean) as { tierCode: string; quantity: number; unitCents: number }[];

    const amountCents = items.reduce((sum, it) => sum + it.quantity * it.unitCents, 0);
    if (amountCents <= 0) {
      return NextResponse.json(
        { error: "Card request requires a priced tier" },
        { status: 400 }
      );
    }

    const { chargeAmount, feeCents } = applyFeeCoverage(amountCents, !!coversFees);

    const totalQty = general + youth;
    const purpose = `Meal passes — ${totalQty} pass${totalQty > 1 ? "es" : ""} (physical, card online)`;

    // Stripe mode + matching publishable key from the active event / app config.
    const { data: event } = await admin
      .from("eckcm_events")
      .select("stripe_mode")
      .eq("id", eventId)
      .maybeSingle();
    const stripeMode = (event?.stripe_mode as "test" | "live") ?? "test";

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

    const stripe = await getStripeForMode(stripeMode);

    // Find or create a Stripe Customer if an email was provided.
    let stripeCustomerId: string | undefined;
    if (payerEmail) {
      const existing = await stripe.customers.list({ email: payerEmail, limit: 1 });
      stripeCustomerId =
        existing.data.length > 0
          ? existing.data[0].id
          : (await stripe.customers.create({ email: payerEmail, name: payerName || undefined })).id;
    }

    // Aggregate request row (same shape as on-site so /admin/meal-passes renders
    // it identically) — but paid online by card.
    const { data: payment, error: payErr } = await admin
      .from("eckcm_custom_payments")
      .insert({
        payer_name: payerName || null,
        payer_email: payerEmail || null,
        purpose,
        amount_cents: amountCents,
        fee_cents: feeCents,
        covers_fees: !!coversFees,
        payment_method: "CARD",
        status: "PENDING",
        metadata: {
          kind: "meal_pass_onsite_request",
          event_id: eventId,
          onsite_method: "CARD",
          items,
          general,
          youth,
          ...(payerPhone ? { payer_phone: payerPhone } : {}),
          ...(churchName ? { church_name: churchName } : {}),
        },
      })
      .select("id")
      .single();

    if (payErr || !payment) {
      logger.error("[mealpay/onsite-card-intent] Failed to insert request", {
        error: payErr?.message ?? "no data",
      });
      return NextResponse.json(
        { error: "Failed to create payment record" },
        { status: 500 }
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: chargeAmount,
      currency: "usd",
      description: `ECKCM ${purpose}`,
      statement_descriptor_suffix: "MEAL",
      ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
      receipt_email: payerEmail || undefined,
      metadata: {
        type: "custom_payment",
        customPaymentId: payment.id,
        coversFees: coversFees ? "true" : "false",
      },
      payment_method_configuration:
        stripeMode === "live"
          ? "pmc_1TIYrzAHIcy4RD4RUlTrBtlE"
          : "pmc_1TIYtSAHIcy4RD4R0iMHaWJu",
    });

    await admin
      .from("eckcm_custom_payments")
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      publishableKey,
      paymentId: payment.id,
      chargeAmount,
      feeCents,
    });
  } catch (err) {
    logger.error("[mealpay/onsite-card-intent] Unhandled error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
