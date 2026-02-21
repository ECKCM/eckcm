import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";

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

  // Load registration + event stripe_mode
  const { data: registration } = await supabase
    .from("eckcm_registrations")
    .select("id, status, created_by_user_id, total_amount_cents, confirmation_code, event_id")
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

  // Load primary registrant name for Zelle memo
  // eckcm_groups.registration_id -> eckcm_group_memberships.group_id -> eckcm_people
  const { data: repMember } = await admin
    .from("eckcm_groups")
    .select("eckcm_group_memberships!inner(eckcm_people!inner(first_name_en, last_name_en), role)")
    .eq("registration_id", registrationId)
    .limit(1)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members = (repMember as any)?.eckcm_group_memberships as any[] | undefined;
  const rep = members?.find((m: any) => m.role === "REPRESENTATIVE") ?? members?.[0];
  const registrantName = rep?.eckcm_people
    ? `${rep.eckcm_people.first_name_en} ${rep.eckcm_people.last_name_en}`
    : null;
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

  // Resolve event's stripe_mode and payment_test_mode
  const { data: event } = await admin
    .from("eckcm_events")
    .select("stripe_mode, payment_test_mode")
    .eq("id", registration.event_id)
    .single();

  const stripeMode = (event?.stripe_mode as "test" | "live") ?? "test";
  const paymentTestMode = event?.payment_test_mode === true;

  // Reuse existing pending PaymentIntent if one exists (idempotent)
  const chargeAmount = paymentTestMode ? 100 : amountCents;
  const stripe = await getStripeForMode(stripeMode);

  const { data: existingPayment } = await admin
    .from("eckcm_payments")
    .select("stripe_payment_intent_id")
    .eq("invoice_id", invoice.id)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingPayment?.stripe_payment_intent_id) {
    try {
      const existing = await stripe.paymentIntents.retrieve(
        existingPayment.stripe_payment_intent_id
      );
      if (
        existing.status === "requires_payment_method" ||
        existing.status === "requires_confirmation" ||
        existing.status === "requires_action"
      ) {
        // Update amount in case payment_test_mode changed
        const updated = await stripe.paymentIntents.update(existing.id, {
          amount: chargeAmount,
        });
        return NextResponse.json({
          clientSecret: updated.client_secret,
          amount: chargeAmount,
          paymentTestMode,
          registrantName,
        });
      }
    } catch {
      // Existing intent invalid — fall through to create new one
    }
  }

  // Create new Stripe PaymentIntent (with idempotency key to prevent duplicates)
  const paymentIntent = await stripe.paymentIntents.create({
    amount: chargeAmount,
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
  }, {
    idempotencyKey: `pi_create_${invoice.id}`,
  });

  // Create pending payment record
  await admin.from("eckcm_payments").insert({
    invoice_id: invoice.id,
    stripe_payment_intent_id: paymentIntent.id,
    payment_method: "STRIPE",
    amount_cents: amountCents,
    status: "PENDING",
  });

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    amount: chargeAmount,
    paymentTestMode,
    registrantName,
  });
}
