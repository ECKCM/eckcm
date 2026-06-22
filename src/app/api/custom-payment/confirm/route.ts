import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { customPaymentConfirmSchema } from "@/lib/schemas/api";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rl = rateLimit(`custom-payment-confirm:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = customPaymentConfirmSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { paymentId, paymentIntentId } = parsed.data;
    const admin = createAdminClient();

    // Load payment
    const { data: payment } = await admin
      .from("eckcm_custom_payments")
      .select("id, status, stripe_payment_intent_id, metadata")
      .eq("id", paymentId)
      .single();

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.status === "SUCCEEDED") {
      return NextResponse.json({ status: "already_confirmed" });
    }

    if (payment.stripe_payment_intent_id !== paymentIntentId) {
      return NextResponse.json(
        { error: "PaymentIntent does not match payment" },
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
    if (paymentIntent.metadata.customPaymentId !== paymentId) {
      return NextResponse.json(
        { error: "PaymentIntent metadata mismatch" },
        { status: 400 }
      );
    }

    // Update payment to SUCCEEDED
    await admin
      .from("eckcm_custom_payments")
      .update({
        status: "SUCCEEDED",
        metadata: {
          ...((payment.metadata as Record<string, unknown> | null) ?? {}),
          stripe_payment_method: paymentIntent.payment_method,
          stripe_charge_id:
            typeof paymentIntent.latest_charge === "string"
              ? paymentIntent.latest_charge
              : null,
          confirmed_by: "client",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId);

    return NextResponse.json({ status: "confirmed" });
  } catch (err) {
    logger.error("[custom-payment/confirm] Unhandled error", {
      error: String(err),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
