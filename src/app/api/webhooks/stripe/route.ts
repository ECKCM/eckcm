import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getStripeServer } from "@/lib/stripe/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEPassToken } from "@/lib/services/epass.service";
import type Stripe from "stripe";

export async function POST(request: Request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature" },
      { status: 400 }
    );
  }

  const stripe = getStripeServer();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 }
    );
  }

  if (event.type === "payment_intent.succeeded") {
    await handlePaymentIntentSucceeded(
      event.data.object as Stripe.PaymentIntent
    );
  } else if (event.type === "payment_intent.payment_failed") {
    await handlePaymentIntentFailed(
      event.data.object as Stripe.PaymentIntent
    );
  }

  return NextResponse.json({ received: true });
}

async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent
) {
  const admin = createAdminClient();
  const { registrationId, invoiceId } = paymentIntent.metadata;

  if (!registrationId || !invoiceId) {
    console.error("Missing metadata in PaymentIntent:", paymentIntent.id);
    return;
  }

  // 1. Update payment record
  await admin
    .from("ECKCM_payments")
    .update({
      status: "SUCCEEDED",
      metadata: {
        stripe_payment_method: paymentIntent.payment_method,
        stripe_charge_id:
          typeof paymentIntent.latest_charge === "string"
            ? paymentIntent.latest_charge
            : null,
      },
    })
    .eq("stripe_payment_intent_id", paymentIntent.id);

  // 2. Update invoice
  await admin
    .from("ECKCM_invoices")
    .update({
      status: "SUCCEEDED",
      paid_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  // 3. Update registration status
  await admin
    .from("ECKCM_registrations")
    .update({ status: "PAID" })
    .eq("id", registrationId);

  // 4. Load registration data to get event_id
  const { data: registration } = await admin
    .from("ECKCM_registrations")
    .select("event_id")
    .eq("id", registrationId)
    .single();

  if (!registration) return;

  // 5. Generate E-Pass tokens for each participant
  const { data: memberships } = await admin
    .from("ECKCM_group_memberships")
    .select("person_id, ECKCM_groups!inner(registration_id)")
    .eq("ECKCM_groups.registration_id", registrationId);

  if (memberships) {
    for (const membership of memberships) {
      const { token, tokenHash } = generateEPassToken();

      await admin.from("ECKCM_epass_tokens").insert({
        person_id: membership.person_id,
        registration_id: registrationId,
        token: token,
        token_hash: tokenHash,
        is_active: true,
      });

      // Store the raw token temporarily in metadata for email delivery
      // In production, you'd send the email here with the token
      console.log(
        `E-Pass generated for person ${membership.person_id}: ${token}`
      );
    }
  }
}

async function handlePaymentIntentFailed(
  paymentIntent: Stripe.PaymentIntent
) {
  const admin = createAdminClient();

  // Update payment record
  await admin
    .from("ECKCM_payments")
    .update({
      status: "FAILED",
      metadata: {
        failure_code: paymentIntent.last_payment_error?.code,
        failure_message: paymentIntent.last_payment_error?.message,
      },
    })
    .eq("stripe_payment_intent_id", paymentIntent.id);

  // Update invoice status back to PENDING
  const { invoiceId } = paymentIntent.metadata;
  if (invoiceId) {
    await admin
      .from("ECKCM_invoices")
      .update({ status: "PENDING" })
      .eq("id", invoiceId);
  }
}
