import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getStripeServer } from "@/lib/stripe/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEPassToken } from "@/lib/services/epass.service";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";
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
  let event: Stripe.Event | null = null;

  // Collect webhook secrets: DB-stored (test/live) + env var fallback
  const admin = createAdminClient();
  const { data: appConfig } = await admin
    .from("eckcm_app_config")
    .select("stripe_test_webhook_secret, stripe_live_webhook_secret")
    .eq("id", 1)
    .single();

  const secrets: string[] = [];
  if (appConfig?.stripe_test_webhook_secret) secrets.push(appConfig.stripe_test_webhook_secret);
  if (appConfig?.stripe_live_webhook_secret) secrets.push(appConfig.stripe_live_webhook_secret);
  if (process.env.STRIPE_WEBHOOK_SECRET) secrets.push(process.env.STRIPE_WEBHOOK_SECRET);

  if (secrets.length === 0) {
    console.error("No webhook secrets configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  // Try each secret until one verifies
  let verified = false;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret);
      verified = true;
      break;
    } catch {
      // Try next secret
    }
  }

  if (!verified || !event) {
    console.error("Webhook signature verification failed with all secrets");
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  switch (event.type) {
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(
        event.data.object as Stripe.PaymentIntent
      );
      break;
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(
        event.data.object as Stripe.PaymentIntent
      );
      break;
    case "payment_intent.canceled":
      await handlePaymentIntentCanceled(
        event.data.object as Stripe.PaymentIntent
      );
      break;
    case "charge.refunded":
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      break;
    case "charge.dispute.created":
      await handleDisputeCreated(event.data.object as Stripe.Dispute);
      break;
    default:
      console.log(`[webhook] Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// payment_intent.succeeded
// ---------------------------------------------------------------------------
async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent
) {
  const admin = createAdminClient();
  const { registrationId, invoiceId } = paymentIntent.metadata;

  if (!registrationId || !invoiceId) {
    console.error("Missing metadata in PaymentIntent:", paymentIntent.id);
    return;
  }

  // Idempotent check: skip if already confirmed
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("status")
    .eq("id", registrationId)
    .single();

  if (reg?.status === "PAID") {
    console.log(`[webhook] Registration ${registrationId} already PAID, skipping.`);
    return;
  }

  // 1. Update or create payment record
  const { data: existingPayment } = await admin
    .from("eckcm_payments")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle();

  if (existingPayment) {
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
        },
      })
      .eq("id", existingPayment.id);
  } else {
    // Payment record missing (e.g., create-intent insert failed) — create it now
    console.log(`[webhook] No payment record for PI ${paymentIntent.id}, creating one.`);
    const paymentMethodType = paymentIntent.payment_method_types?.[0] ?? "card";
    const method = paymentMethodType === "us_bank_account" ? "ACH" : "CARD";
    await admin.from("eckcm_payments").insert({
      invoice_id: invoiceId,
      stripe_payment_intent_id: paymentIntent.id,
      payment_method: method,
      amount_cents: paymentIntent.amount,
      status: "SUCCEEDED",
      metadata: {
        stripe_payment_method: paymentIntent.payment_method,
        stripe_charge_id:
          typeof paymentIntent.latest_charge === "string"
            ? paymentIntent.latest_charge
            : null,
        created_by_webhook: true,
      },
    });
  }

  // 2. Update invoice
  await admin
    .from("eckcm_invoices")
    .update({
      status: "SUCCEEDED",
      paid_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  // 3. Update registration status
  await admin
    .from("eckcm_registrations")
    .update({ status: "PAID" })
    .eq("id", registrationId);

  // 4. Load registration data to get event_id
  const { data: registration } = await admin
    .from("eckcm_registrations")
    .select("event_id")
    .eq("id", registrationId)
    .single();

  if (!registration) return;

  // 5. Generate E-Pass tokens for each participant (idempotent)
  const { data: memberships } = await admin
    .from("eckcm_group_memberships")
    .select("person_id, eckcm_groups!inner(registration_id)")
    .eq("eckcm_groups.registration_id", registrationId);

  if (memberships) {
    for (const membership of memberships) {
      const { data: existingToken } = await admin
        .from("eckcm_epass_tokens")
        .select("id")
        .eq("person_id", membership.person_id)
        .eq("registration_id", registrationId)
        .maybeSingle();

      if (!existingToken) {
        const { token, tokenHash } = generateEPassToken();

        await admin.from("eckcm_epass_tokens").insert({
          person_id: membership.person_id,
          registration_id: registrationId,
          token: token,
          token_hash: tokenHash,
          is_active: true,
        });

        console.log(
          `E-Pass generated for person ${membership.person_id}: ${token}`
        );
      }
    }
  }

  // 6. Send confirmation email (non-blocking, non-fatal)
  try {
    await sendConfirmationEmail(registrationId);
  } catch (err) {
    console.error("[webhook] Failed to send confirmation email:", err);
  }
}

// ---------------------------------------------------------------------------
// payment_intent.payment_failed
// ---------------------------------------------------------------------------
async function handlePaymentIntentFailed(
  paymentIntent: Stripe.PaymentIntent
) {
  const admin = createAdminClient();

  // Update payment record
  await admin
    .from("eckcm_payments")
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
      .from("eckcm_invoices")
      .update({ status: "PENDING" })
      .eq("id", invoiceId);
  }
}

// ---------------------------------------------------------------------------
// payment_intent.canceled
// ---------------------------------------------------------------------------
async function handlePaymentIntentCanceled(
  paymentIntent: Stripe.PaymentIntent
) {
  const admin = createAdminClient();

  // Find our payment record
  const { data: payment } = await admin
    .from("eckcm_payments")
    .select("id, status, invoice_id")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle();

  if (!payment) {
    console.log(`[webhook] No payment found for canceled PI: ${paymentIntent.id}`);
    return;
  }

  // Skip if already in a terminal state
  if (payment.status !== "PENDING") {
    console.log(`[webhook] Payment ${payment.id} already ${payment.status}, skipping cancel.`);
    return;
  }

  // Update payment to FAILED
  await admin
    .from("eckcm_payments")
    .update({ status: "FAILED" })
    .eq("id", payment.id);

  // Reset invoice back to PENDING
  if (payment.invoice_id) {
    await admin
      .from("eckcm_invoices")
      .update({ status: "PENDING" })
      .eq("id", payment.invoice_id);
  }

  // Audit log
  const { registrationId } = paymentIntent.metadata;
  const { data: reg } = registrationId
    ? await admin
        .from("eckcm_registrations")
        .select("event_id")
        .eq("id", registrationId)
        .single()
    : { data: null };

  await admin.from("eckcm_audit_logs").insert({
    event_id: reg?.event_id ?? null,
    user_id: null,
    action: "payment_intent.canceled",
    entity_type: "payment",
    entity_id: payment.id,
    old_data: { status: "PENDING" },
    new_data: {
      status: "FAILED",
      cancellation_reason: paymentIntent.cancellation_reason,
    },
  });

  console.log(`[webhook] PaymentIntent ${paymentIntent.id} canceled, payment ${payment.id} -> FAILED`);
}

// ---------------------------------------------------------------------------
// charge.refunded
// ---------------------------------------------------------------------------
async function handleChargeRefunded(charge: Stripe.Charge) {
  const admin = createAdminClient();

  // Resolve PaymentIntent ID from charge
  const piId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;

  if (!piId) {
    console.error("[webhook] charge.refunded has no payment_intent:", charge.id);
    return;
  }

  // Find our payment record
  const { data: payment } = await admin
    .from("eckcm_payments")
    .select("id, status, invoice_id")
    .eq("stripe_payment_intent_id", piId)
    .maybeSingle();

  if (!payment) {
    console.log(`[webhook] No payment found for refunded charge PI: ${piId}`);
    return;
  }

  // Determine full vs partial refund
  const isFullRefund = charge.amount_refunded === charge.amount;
  const refundStatus = isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED";

  // Get the latest refund from the charge's refunds list
  const latestRefund = charge.refunds?.data?.[0];

  // 1. Insert refund record (skip if admin API already created it)
  const stripeRefundId = latestRefund?.id ?? null;
  if (stripeRefundId) {
    const { data: existingRefund } = await admin
      .from("eckcm_refunds")
      .select("id")
      .eq("stripe_refund_id", stripeRefundId)
      .maybeSingle();

    if (existingRefund) {
      console.log(`[webhook] Refund record for ${stripeRefundId} already exists, skipping insert.`);
    } else {
      await admin.from("eckcm_refunds").insert({
        payment_id: payment.id,
        stripe_refund_id: stripeRefundId,
        amount_cents: latestRefund?.amount ?? charge.amount_refunded,
        reason: latestRefund?.reason ?? null,
        refunded_by: null,
      });
    }
  } else {
    await admin.from("eckcm_refunds").insert({
      payment_id: payment.id,
      stripe_refund_id: null,
      amount_cents: charge.amount_refunded,
      reason: null,
      refunded_by: null,
    });
  }

  // 2. Update payment status
  await admin
    .from("eckcm_payments")
    .update({ status: refundStatus })
    .eq("id", payment.id);

  // 3. Update invoice status
  if (payment.invoice_id) {
    await admin
      .from("eckcm_invoices")
      .update({ status: refundStatus })
      .eq("id", payment.invoice_id);

    // 4. For full refund: update registration + deactivate E-Pass tokens
    if (isFullRefund) {
      const { data: invoice } = await admin
        .from("eckcm_invoices")
        .select("registration_id")
        .eq("id", payment.invoice_id)
        .single();

      if (invoice?.registration_id) {
        await admin
          .from("eckcm_registrations")
          .update({ status: "REFUNDED" })
          .eq("id", invoice.registration_id);

        // Deactivate all E-Pass tokens for this registration
        await admin
          .from("eckcm_epass_tokens")
          .update({ is_active: false })
          .eq("registration_id", invoice.registration_id);
      }
    }
  }

  // 5. Audit log
  // Resolve event_id through invoice -> registration
  let eventId: string | null = null;
  if (payment.invoice_id) {
    const { data: inv } = await admin
      .from("eckcm_invoices")
      .select("registration_id")
      .eq("id", payment.invoice_id)
      .single();
    if (inv?.registration_id) {
      const { data: reg } = await admin
        .from("eckcm_registrations")
        .select("event_id")
        .eq("id", inv.registration_id)
        .single();
      eventId = reg?.event_id ?? null;
    }
  }

  await admin.from("eckcm_audit_logs").insert({
    event_id: eventId,
    user_id: null,
    action: "charge.refunded",
    entity_type: "payment",
    entity_id: payment.id,
    old_data: { status: payment.status },
    new_data: {
      status: refundStatus,
      stripe_refund_id: latestRefund?.id,
      amount_refunded_cents: latestRefund?.amount ?? charge.amount_refunded,
      is_full_refund: isFullRefund,
    },
  });

  console.log(
    `[webhook] Charge ${charge.id} refunded (${isFullRefund ? "full" : "partial"}), payment ${payment.id} -> ${refundStatus}`
  );
}

// ---------------------------------------------------------------------------
// charge.dispute.created
// ---------------------------------------------------------------------------
async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const admin = createAdminClient();

  // Resolve PaymentIntent ID from dispute
  const piId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id;

  if (!piId) {
    console.error("[webhook] charge.dispute.created has no payment_intent:", dispute.id);
    return;
  }

  // Find our payment record
  const { data: payment } = await admin
    .from("eckcm_payments")
    .select("id, invoice_id, metadata")
    .eq("stripe_payment_intent_id", piId)
    .maybeSingle();

  if (!payment) {
    console.log(`[webhook] No payment found for dispute PI: ${piId}`);
    return;
  }

  // 1. Update payment metadata with dispute info
  const existingMeta = (payment.metadata as Record<string, unknown>) ?? {};
  await admin
    .from("eckcm_payments")
    .update({
      metadata: {
        ...existingMeta,
        dispute_id: dispute.id,
        dispute_reason: dispute.reason,
        dispute_status: dispute.status,
        dispute_amount: dispute.amount,
        dispute_created: dispute.created,
      },
    })
    .eq("id", payment.id);

  // 2. Resolve event_id for audit log & notifications
  let eventId: string | null = null;
  let confirmationCode: string | null = null;
  if (payment.invoice_id) {
    const { data: inv } = await admin
      .from("eckcm_invoices")
      .select("registration_id")
      .eq("id", payment.invoice_id)
      .single();
    if (inv?.registration_id) {
      const { data: reg } = await admin
        .from("eckcm_registrations")
        .select("event_id, confirmation_code")
        .eq("id", inv.registration_id)
        .single();
      eventId = reg?.event_id ?? null;
      confirmationCode = reg?.confirmation_code ?? null;
    }
  }

  // 3. Audit log
  await admin.from("eckcm_audit_logs").insert({
    event_id: eventId,
    user_id: null,
    action: "charge.dispute.created",
    entity_type: "payment",
    entity_id: payment.id,
    new_data: {
      dispute_id: dispute.id,
      dispute_reason: dispute.reason,
      dispute_status: dispute.status,
      dispute_amount: dispute.amount,
    },
  });

  // 4. Notify all SUPER_ADMIN users
  const { data: superAdmins } = await admin
    .from("eckcm_staff_assignments")
    .select("user_id, eckcm_roles!inner(name)")
    .eq("eckcm_roles.name", "SUPER_ADMIN")
    .eq("is_active", true);

  if (superAdmins) {
    const amountStr = `$${(dispute.amount / 100).toFixed(2)}`;
    const codeStr = confirmationCode ? ` (${confirmationCode})` : "";

    for (const sa of superAdmins) {
      await admin.from("eckcm_notifications").insert({
        user_id: sa.user_id,
        event_id: eventId,
        title_en: "Payment Dispute Filed",
        title_ko: "결제 분쟁 발생",
        body_en: `A ${amountStr} dispute was filed${codeStr}. Reason: ${dispute.reason}. Respond in Stripe Dashboard.`,
        body_ko: `${amountStr} 결제 분쟁이 접수되었습니다${codeStr}. 사유: ${dispute.reason}. Stripe 대시보드에서 대응하세요.`,
        type: "dispute_created",
      });
    }
  }

  console.log(
    `[webhook] Dispute ${dispute.id} created for payment ${payment.id}, reason: ${dispute.reason}`
  );
}
