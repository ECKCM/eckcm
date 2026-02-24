import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { generateEPassToken } from "@/lib/services/epass.service";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";

interface ConfirmBody {
  registrationId: string;
  paymentIntentId: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: ConfirmBody = await request.json();
  const { registrationId, paymentIntentId } = body;

  if (!registrationId || !paymentIntentId) {
    return NextResponse.json(
      { error: "Missing registrationId or paymentIntentId" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Load registration
  const { data: registration } = await admin
    .from("eckcm_registrations")
    .select("id, status, created_by_user_id, event_id")
    .eq("id", registrationId)
    .single();

  if (!registration) {
    return NextResponse.json(
      { error: "Registration not found" },
      { status: 404 }
    );
  }

  if (registration.created_by_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Already paid — idempotent
  if (registration.status === "PAID") {
    return NextResponse.json({ status: "already_confirmed" });
  }

  // Resolve stripe mode and verify payment with Stripe
  const { data: event } = await admin
    .from("eckcm_events")
    .select("stripe_mode")
    .eq("id", registration.event_id)
    .single();

  const stripeMode = (event?.stripe_mode as "test" | "live") ?? "test";
  const stripe = await getStripeForMode(stripeMode);

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (paymentIntent.status !== "succeeded") {
    return NextResponse.json(
      { error: `Payment not succeeded. Status: ${paymentIntent.status}` },
      { status: 400 }
    );
  }

  // Verify metadata matches
  if (paymentIntent.metadata.registrationId !== registrationId) {
    return NextResponse.json(
      { error: "PaymentIntent does not match registration" },
      { status: 400 }
    );
  }

  const invoiceId = paymentIntent.metadata.invoiceId;

  // 1. Update payment record
  await admin
    .from("eckcm_payments")
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
    .eq("stripe_payment_intent_id", paymentIntentId);

  // 2. Update invoice
  if (invoiceId) {
    await admin
      .from("eckcm_invoices")
      .update({
        status: "SUCCEEDED",
        paid_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);
  }

  // 3. Update registration status
  await admin
    .from("eckcm_registrations")
    .update({ status: "PAID" })
    .eq("id", registrationId);

  // 4. Generate E-Pass tokens
  const { data: memberships, error: membershipError } = await admin
    .from("eckcm_group_memberships")
    .select("person_id, eckcm_groups!inner(registration_id)")
    .eq("eckcm_groups.registration_id", registrationId);

  if (membershipError) {
    console.error("[payment/confirm] Failed to load memberships:", membershipError);
  }

  let tokensGenerated = 0;
  if (memberships) {
    for (const membership of memberships) {
      // Check if token already exists (idempotent)
      const { data: existing } = await admin
        .from("eckcm_epass_tokens")
        .select("id")
        .eq("person_id", membership.person_id)
        .eq("registration_id", registrationId)
        .maybeSingle();

      if (!existing) {
        const { token, tokenHash } = generateEPassToken();
        const { error: insertError } = await admin
          .from("eckcm_epass_tokens")
          .insert({
            person_id: membership.person_id,
            registration_id: registrationId,
            token,
            token_hash: tokenHash,
            is_active: true,
          });
        if (insertError) {
          console.error("[payment/confirm] Failed to insert epass token:", insertError);
        } else {
          tokensGenerated++;
        }
      }
    }
  }
  console.log(`[payment/confirm] E-Pass: ${tokensGenerated} generated for ${memberships?.length ?? 0} members`);

  // 5. Send confirmation email (non-blocking)
  try {
    await sendConfirmationEmail(registrationId);
  } catch (err) {
    console.error("[payment/confirm] Failed to send confirmation email:", err);
  }

  return NextResponse.json({ status: "confirmed" });
}
