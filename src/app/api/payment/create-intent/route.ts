import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeServer } from "@/lib/stripe/config";

interface CreateIntentBody {
  registrationId: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: CreateIntentBody = await request.json();
  const { registrationId } = body;

  if (!registrationId) {
    return NextResponse.json(
      { error: "Missing registrationId" },
      { status: 400 }
    );
  }

  // Load registration + invoice
  const { data: registration } = await supabase
    .from("eckcm_registrations")
    .select("id, status, created_by_user_id, total_amount_cents, confirmation_code")
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

  if (registration.status === "PAID") {
    return NextResponse.json(
      { error: "Registration already paid" },
      { status: 409 }
    );
  }

  // Load invoice (use admin client to bypass RLS)
  const admin = createAdminClient();
  const { data: invoice } = await admin
    .from("eckcm_invoices")
    .select("id, total_cents, status")
    .eq("registration_id", registrationId)
    .single();

  if (!invoice) {
    return NextResponse.json(
      { error: "Invoice not found" },
      { status: 404 }
    );
  }

  if (invoice.status === "SUCCEEDED") {
    return NextResponse.json(
      { error: "Invoice already paid" },
      { status: 409 }
    );
  }

  const amountCents = invoice.total_cents;

  if (amountCents <= 0) {
    return NextResponse.json(
      { error: "Invalid payment amount" },
      { status: 400 }
    );
  }

  // Create Stripe PaymentIntent
  const stripe = getStripeServer();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    metadata: {
      registrationId,
      invoiceId: invoice.id,
      userId: user.id,
      confirmationCode: registration.confirmation_code,
    },
    payment_method_types: [
      "card",
      "us_bank_account",
      "klarna",
      "amazon_pay",
    ],
  });

  // Create pending payment record
  await supabase.from("eckcm_payments").insert({
    invoice_id: invoice.id,
    stripe_payment_intent_id: paymentIntent.id,
    payment_method: "STRIPE",
    amount_cents: amountCents,
    status: "PENDING",
  });

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    amount: amountCents,
  });
}
