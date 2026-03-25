import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { donationCreateIntentSchema } from "@/lib/schemas/api";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    // Rate limit by IP (no user context for public donations)
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rl = rateLimit(`donation-intent:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = donationCreateIntentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { amountCents, donorName, donorEmail, coversFees } = parsed.data;

    const admin = createAdminClient();

    // Get stripe mode from active event (fallback to test)
    const { data: event } = await admin
      .from("eckcm_events")
      .select("stripe_mode")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const stripeMode = (event?.stripe_mode as "test" | "live") ?? "test";

    // Calculate charge amount with optional fee coverage (2.9% + $0.30)
    const chargeAmount = coversFees
      ? Math.ceil((amountCents + 30) / (1 - 0.029))
      : amountCents;
    const feeCents = coversFees ? chargeAmount - amountCents : 0;

    const stripe = await getStripeForMode(stripeMode);

    // Find or create Stripe Customer if email provided
    let stripeCustomerId: string | undefined;
    if (donorEmail) {
      const existing = await stripe.customers.list({
        email: donorEmail,
        limit: 1,
      });
      if (existing.data.length > 0) {
        stripeCustomerId = existing.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: donorEmail,
          name: donorName || undefined,
        });
        stripeCustomerId = customer.id;
      }
    }

    // Create donation record first to get the ID for metadata
    const { data: donation, error: insertError } = await admin
      .from("eckcm_donations")
      .insert({
        donor_name: donorName || null,
        donor_email: donorEmail || null,
        amount_cents: amountCents,
        fee_cents: feeCents,
        covers_fees: !!coversFees,
        payment_method: "CARD",
        status: "PENDING",
      })
      .select("id")
      .single();

    if (insertError || !donation) {
      logger.error("[donation/create-intent] Failed to insert donation", {
        error: insertError?.message ?? "no data returned",
      });
      return NextResponse.json(
        { error: "Failed to create donation record" },
        { status: 500 }
      );
    }

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: chargeAmount,
      currency: "usd",
      description: "ECKCM Donation",
      ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
      receipt_email: donorEmail || undefined,
      metadata: {
        donationId: donation.id,
        type: "donation",
        coversFees: coversFees ? "true" : "false",
      },
      payment_method_types: ["card"],
    });

    // Update donation with Stripe PI ID
    await admin
      .from("eckcm_donations")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", donation.id);

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      donationId: donation.id,
      chargeAmount,
      feeCents,
    });
  } catch (err) {
    logger.error("[donation/create-intent] Unhandled error", {
      error: String(err),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
