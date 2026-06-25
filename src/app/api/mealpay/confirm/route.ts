import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { mealpayConfirmSchema } from "@/lib/schemas/api";
import { buildMealPassUrl } from "@/lib/services/meal-pass.service";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Confirm a card meal-pass purchase. Mirrors /api/custom-payment/confirm but
 * also flips the linked eckcm_meal_passes row PENDING → ACTIVE and returns the
 * token so the client can render the QR. The webhook is the idempotent backup.
 */
export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rl = rateLimit(`mealpay-confirm:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = mealpayConfirmSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { mealPassId, paymentIntentId } = parsed.data;
    const admin = createAdminClient();

    const { data: pass } = await admin
      .from("eckcm_meal_passes")
      .select("id, status, token, custom_payment_id")
      .eq("id", mealPassId)
      .single();

    if (!pass) {
      return NextResponse.json({ error: "Meal pass not found" }, { status: 404 });
    }

    // Already active (webhook beat us, or a double submit) — just return the QR.
    if (pass.status === "ACTIVE" || pass.status === "USED_UP") {
      return NextResponse.json({
        status: "already_confirmed",
        token: pass.token,
        redeemUrl: buildMealPassUrl(pass.token),
      });
    }

    // Verify the PaymentIntent against Stripe before activating (memory: Stripe
    // PI Safety — never trust local state for money-linked rows).
    const { data: event } = await admin
      .from("eckcm_events")
      .select("stripe_mode")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const stripeMode = (event?.stripe_mode as "test" | "live") ?? "test";
    const stripe = await getStripeForMode(stripeMode);

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== "succeeded") {
      return NextResponse.json(
        { error: `Payment not succeeded. Status: ${pi.status}` },
        { status: 400 }
      );
    }
    if (pi.metadata.mealPassId !== mealPassId) {
      return NextResponse.json(
        { error: "PaymentIntent metadata mismatch" },
        { status: 400 }
      );
    }

    // Flip the payment row to SUCCEEDED.
    if (pass.custom_payment_id) {
      const { data: payment } = await admin
        .from("eckcm_custom_payments")
        .select("metadata")
        .eq("id", pass.custom_payment_id)
        .single();
      await admin
        .from("eckcm_custom_payments")
        .update({
          status: "SUCCEEDED",
          metadata: {
            ...((payment?.metadata as Record<string, unknown> | null) ?? {}),
            stripe_payment_method: pi.payment_method,
            stripe_charge_id:
              typeof pi.latest_charge === "string" ? pi.latest_charge : null,
            confirmed_by: "client",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", pass.custom_payment_id);
    }

    // Activate the pass.
    await admin
      .from("eckcm_meal_passes")
      .update({ status: "ACTIVE", updated_at: new Date().toISOString() })
      .eq("id", mealPassId);

    return NextResponse.json({
      status: "confirmed",
      token: pass.token,
      redeemUrl: buildMealPassUrl(pass.token),
    });
  } catch (err) {
    logger.error("[mealpay/confirm] Unhandled error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
