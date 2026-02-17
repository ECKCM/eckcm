import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripeServer } from "@/lib/stripe/config";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paymentIntentId } = await request.json();
  if (!paymentIntentId || typeof paymentIntentId !== "string") {
    return NextResponse.json(
      { error: "paymentIntentId is required" },
      { status: 400 }
    );
  }

  const stripe = getStripeServer();
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
