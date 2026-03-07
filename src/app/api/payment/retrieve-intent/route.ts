import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paymentIntentId, eventId } = await request.json();
  if (!paymentIntentId || typeof paymentIntentId !== "string") {
    return NextResponse.json(
      { error: "paymentIntentId is required" },
      { status: 400 }
    );
  }

  // Resolve stripe mode from event
  let stripeMode: "test" | "live" = "test";
  const admin = createAdminClient();
  if (eventId) {
    const { data: event } = await admin
      .from("eckcm_events")
      .select("stripe_mode")
      .eq("id", eventId)
      .single();
    if (event?.stripe_mode === "live") stripeMode = "live";
  } else {
    const { data: payment } = await admin
      .from("eckcm_payments")
      .select(
        "invoice_id, eckcm_invoices!inner(registration_id, eckcm_registrations!inner(event_id, created_by_user_id, eckcm_events!inner(stripe_mode)))"
      )
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();

    const paymentData = payment as unknown as {
      eckcm_invoices?: {
        registration_id: string;
        eckcm_registrations?: {
          event_id: string;
          created_by_user_id: string;
          eckcm_events?: { stripe_mode: "test" | "live" | null };
        };
      };
    } | null;

    const createdByUserId =
      paymentData?.eckcm_invoices?.eckcm_registrations?.created_by_user_id;
    if (createdByUserId && createdByUserId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (
      paymentData?.eckcm_invoices?.eckcm_registrations?.eckcm_events?.stripe_mode ===
      "live"
    ) {
      stripeMode = "live";
    }
  }

  const stripe = await getStripeForMode(stripeMode);
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  // Verify this payment belongs to the authenticated user
  if (paymentIntent.metadata?.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    status: paymentIntent.status,
    registrationId: paymentIntent.metadata?.registrationId,
    confirmationCode: paymentIntent.metadata?.confirmationCode,
  });
}
