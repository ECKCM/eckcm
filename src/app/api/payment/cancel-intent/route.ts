import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const paymentIntentId = body?.paymentIntentId;
    if (!paymentIntentId || typeof paymentIntentId !== "string") {
      return NextResponse.json({ error: "Missing paymentIntentId" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Find the pending payment record with this PI
    const { data: payment } = await admin
      .from("eckcm_payments")
      .select("id, invoice_id")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .eq("status", "PENDING")
      .maybeSingle();

    if (!payment) {
      return NextResponse.json({ success: true });
    }

    // Verify ownership via invoice → registration
    const { data: invoice } = await admin
      .from("eckcm_invoices")
      .select("registration_id")
      .eq("id", payment.invoice_id)
      .single();

    if (invoice) {
      const { data: reg } = await admin
        .from("eckcm_registrations")
        .select("created_by_user_id, event_id")
        .eq("id", invoice.registration_id)
        .single();

      if (!reg || reg.created_by_user_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Cancel the Stripe PI
      try {
        const { data: event } = await admin
          .from("eckcm_events")
          .select("stripe_mode")
          .eq("id", reg.event_id)
          .single();

        const stripe = await getStripeForMode(
          (event?.stripe_mode as "test" | "live") ?? "test"
        );
        await stripe.paymentIntents.cancel(paymentIntentId);
      } catch (err) {
        logger.warn("[payment/cancel-intent] Failed to cancel Stripe PI", {
          piId: paymentIntentId,
          error: String(err),
        });
      }
    }

    // Clean up DB record
    await admin.from("eckcm_payments").delete().eq("id", payment.id);

    logger.info("[payment/cancel-intent] Canceled orphaned PI on page unload", {
      piId: paymentIntentId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[payment/cancel-intent] Unhandled error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
