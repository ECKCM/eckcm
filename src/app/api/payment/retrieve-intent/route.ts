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
  if (eventId) {
    const admin = createAdminClient();
    const { data: event } = await admin
      .from("eckcm_events")
      .select("stripe_mode")
      .eq("id", eventId)
      .single();
    if (event?.stripe_mode === "live") stripeMode = "live";
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
