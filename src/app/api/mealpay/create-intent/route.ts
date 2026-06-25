import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { mealpayCreateIntentSchema } from "@/lib/schemas/api";
import {
  getMealUnitPriceCents,
  applyFeeCoverage,
  buildMealPassUrl,
  newMealPassToken,
} from "@/lib/services/meal-pass.service";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Public meal-pass purchase (card path). Mirrors /api/custom-payment/create-intent:
 * inserts a PENDING eckcm_custom_payments row + a PENDING eckcm_meal_passes row,
 * creates a Stripe PaymentIntent tagged `type:"meal_pass"`, and returns the
 * clientSecret. The pass token is pre-created so the client can show the QR on
 * the success screen; the webhook/confirm flips PENDING → ACTIVE.
 *
 * Free tier (price $0) short-circuits Stripe: the pass is created ACTIVE and the
 * token returned immediately.
 */
export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rl = rateLimit(`mealpay-intent:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = mealpayCreateIntentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { eventId, tierCode, quantity, payerName, payerEmail, payerPhone, churchName, coversFees } =
      parsed.data;

    // Phone + church have no dedicated columns; carry them in metadata.
    const contactMeta = {
      ...(payerPhone ? { payer_phone: payerPhone } : {}),
      ...(churchName ? { church_name: churchName } : {}),
    };

    const admin = createAdminClient();

    // Resolve per-meal price server-side (never trust the client).
    const unitPrice = await getMealUnitPriceCents(admin, tierCode);
    if (unitPrice == null) {
      return NextResponse.json(
        { error: "Meal pricing is not configured for this tier" },
        { status: 400 }
      );
    }
    const amountCents = unitPrice * quantity;

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

    const purpose = `Meal pass — ${quantity} meal${quantity > 1 ? "s" : ""}`;

    // ── Free tier ($0): no Stripe, activate immediately ──
    if (amountCents === 0) {
      const { token, tokenHash } = newMealPassToken();
      const { error: freeErr } = await admin.from("eckcm_meal_passes").insert({
        event_id: eventId,
        token,
        token_hash: tokenHash,
        payer_name: payerName || null,
        payer_email: payerEmail || null,
        tier_code: tierCode,
        uses_total: quantity,
        uses_consumed: 0,
        amount_cents: 0,
        pass_kind: "PURCHASED",
        status: "ACTIVE",
        metadata: contactMeta,
      });
      if (freeErr) {
        logger.error("[mealpay/create-intent] Failed to insert free pass", {
          error: freeErr.message,
        });
        return NextResponse.json(
          { error: "Failed to create meal pass" },
          { status: 500 }
        );
      }
      return NextResponse.json({
        paid: false,
        token,
        redeemUrl: buildMealPassUrl(token),
      });
    }

    const { chargeAmount, feeCents } = applyFeeCoverage(amountCents, !!coversFees);

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

    // Payment row first (mirrors custom_payments), then the pass linked to it.
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
        metadata: { kind: "meal_pass", ...contactMeta },
      })
      .select("id")
      .single();

    if (payErr || !payment) {
      logger.error("[mealpay/create-intent] Failed to insert payment", {
        error: payErr?.message ?? "no data",
      });
      return NextResponse.json(
        { error: "Failed to create payment record" },
        { status: 500 }
      );
    }

    const { token, tokenHash } = newMealPassToken();
    const { data: pass, error: passErr } = await admin
      .from("eckcm_meal_passes")
      .insert({
        event_id: eventId,
        token,
        token_hash: tokenHash,
        payer_name: payerName || null,
        payer_email: payerEmail || null,
        tier_code: tierCode,
        uses_total: quantity,
        uses_consumed: 0,
        custom_payment_id: payment.id,
        amount_cents: amountCents,
        pass_kind: "PURCHASED",
        status: "PENDING",
        metadata: contactMeta,
      })
      .select("id")
      .single();

    if (passErr || !pass) {
      logger.error("[mealpay/create-intent] Failed to insert meal pass", {
        error: passErr?.message ?? "no data",
      });
      return NextResponse.json(
        { error: "Failed to create meal pass" },
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
        type: "meal_pass",
        mealPassId: pass.id,
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
      paid: true,
      clientSecret: paymentIntent.client_secret,
      publishableKey,
      chargeAmount,
      feeCents,
      mealPassId: pass.id,
      paymentId: payment.id,
    });
  } catch (err) {
    logger.error("[mealpay/create-intent] Unhandled error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
