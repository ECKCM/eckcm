import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { donationConfirmSchema } from "@/lib/schemas/api";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rl = rateLimit(`donation-confirm:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = donationConfirmSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { donationId, paymentIntentId } = parsed.data;
    const admin = createAdminClient();

    // Load donation
    const { data: donation } = await admin
      .from("eckcm_donations")
      .select("id, status, stripe_payment_intent_id")
      .eq("id", donationId)
      .single();

    if (!donation) {
      return NextResponse.json(
        { error: "Donation not found" },
        { status: 404 }
      );
    }

    if (donation.status === "SUCCEEDED") {
      return NextResponse.json({ status: "already_confirmed" });
    }

    if (donation.stripe_payment_intent_id !== paymentIntentId) {
      return NextResponse.json(
        { error: "PaymentIntent does not match donation" },
        { status: 400 }
      );
    }

    // Get stripe mode from active event
    const { data: event } = await admin
      .from("eckcm_events")
      .select("stripe_mode")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const stripeMode = (event?.stripe_mode as "test" | "live") ?? "test";
    const stripe = await getStripeForMode(stripeMode);

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json(
        { error: `Payment not succeeded. Status: ${paymentIntent.status}` },
        { status: 400 }
      );
    }

    // Verify metadata
    if (paymentIntent.metadata.donationId !== donationId) {
      return NextResponse.json(
        { error: "PaymentIntent metadata mismatch" },
        { status: 400 }
      );
    }

    // Update donation to SUCCEEDED
    await admin
      .from("eckcm_donations")
      .update({
        status: "SUCCEEDED",
        metadata: {
          stripe_payment_method: paymentIntent.payment_method,
          stripe_charge_id:
            typeof paymentIntent.latest_charge === "string"
              ? paymentIntent.latest_charge
              : null,
          confirmed_by: "client",
        },
      })
      .eq("id", donationId);

    return NextResponse.json({ status: "confirmed" });
  } catch (err) {
    logger.error("[donation/confirm] Unhandled error", {
      error: String(err),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
