import { NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { generateEPassToken } from "@/lib/services/epass.service";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";
import { logger } from "@/lib/logger";
import type Stripe from "stripe";
import { recalculateInventorySafe } from "@/lib/services/inventory.service";

/**
 * Stripe webhook handler.
 * Handles payment_intent.succeeded (ACH finally clears) and
 * payment_intent.payment_failed (ACH rejected by bank).
 *
 * Card payments are already confirmed instantly via /api/payment/confirm,
 * so webhooks for card are idempotent no-ops.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Determine which mode this webhook is for by trying both secrets
  const admin = createAdminClient();
  const { data: config } = await admin
    .from("eckcm_app_config")
    .select("stripe_test_secret_key, stripe_live_secret_key, stripe_test_webhook_secret, stripe_live_webhook_secret")
    .eq("id", 1)
    .single();

  if (!config) {
    logger.error("[stripe/webhook] Failed to load app config");
    return NextResponse.json({ error: "Config error" }, { status: 500 });
  }

  let event: Stripe.Event | null = null;
  let stripeMode: "test" | "live" = "test";

  // Try each webhook secret to construct the event
  for (const mode of ["live", "test"] as const) {
    const secret = mode === "live"
      ? config.stripe_live_webhook_secret
      : config.stripe_test_webhook_secret;
    if (!secret) continue;

    try {
      const stripe = await getStripeForMode(mode);
      event = stripe.webhooks.constructEvent(body, sig, secret);
      stripeMode = mode;
      break;
    } catch {
      // Try next mode
    }
  }

  if (!event) {
    logger.warn("[stripe/webhook] Signature verification failed for all modes");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  logger.info("[stripe/webhook] Received event", {
    type: event.type,
    mode: stripeMode,
    piId: (event.data.object as any)?.id,
  });

  // ── payment_intent.succeeded ──────────────────────────────────────
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;

    // ── Donation payments ──
    if (pi.metadata?.type === "donation" && pi.metadata?.donationId) {
      const donationId = pi.metadata.donationId;
      const { data: donation } = await admin
        .from("eckcm_donations")
        .select("id, status")
        .eq("id", donationId)
        .single();

      if (!donation) {
        logger.warn("[stripe/webhook] Donation not found", { donationId });
        return NextResponse.json({ received: true });
      }

      if (donation.status === "SUCCEEDED") {
        logger.info("[stripe/webhook] Donation already SUCCEEDED, skipping", { donationId });
        return NextResponse.json({ received: true });
      }

      await admin
        .from("eckcm_donations")
        .update({
          status: "SUCCEEDED",
          metadata: {
            stripe_payment_method: pi.payment_method,
            stripe_charge_id:
              typeof pi.latest_charge === "string" ? pi.latest_charge : null,
            confirmed_by: "webhook",
          },
        })
        .eq("id", donationId);

      logger.info("[stripe/webhook] Donation succeeded", { donationId, piId: pi.id });
      return NextResponse.json({ received: true });
    }

    // ── Registration payments ──
    const registrationId = pi.metadata?.registrationId;
    const invoiceId = pi.metadata?.invoiceId;

    if (!registrationId) {
      // Not our PI or missing metadata
      return NextResponse.json({ received: true });
    }

    // Check current registration status
    const { data: registration } = await admin
      .from("eckcm_registrations")
      .select("id, status")
      .eq("id", registrationId)
      .single();

    if (!registration) {
      logger.warn("[stripe/webhook] Registration not found", { registrationId });
      return NextResponse.json({ received: true });
    }

    // Already PAID (card payment already confirmed via /api/payment/confirm)
    if (registration.status === "PAID") {
      logger.info("[stripe/webhook] Registration already PAID, skipping", { registrationId });
      return NextResponse.json({ received: true });
    }

    // ACH payment succeeded — upgrade from SUBMITTED/DRAFT to PAID
    logger.info("[stripe/webhook] ACH payment succeeded — updating to PAID", {
      registrationId,
      previousStatus: registration.status,
    });

    await admin
      .from("eckcm_registrations")
      .update({ status: "PAID" })
      .eq("id", registrationId);

    // Update payment record
    await admin
      .from("eckcm_payments")
      .update({
        status: "SUCCEEDED",
        metadata: {
          stripe_payment_method: pi.payment_method,
          stripe_charge_id:
            typeof pi.latest_charge === "string" ? pi.latest_charge : null,
          confirmed_by: "webhook",
        },
      })
      .eq("stripe_payment_intent_id", pi.id);

    // Update invoice
    if (invoiceId) {
      await admin
        .from("eckcm_invoices")
        .update({ status: "SUCCEEDED", paid_at: new Date().toISOString() })
        .eq("id", invoiceId);
    }

    // Generate E-Pass tokens
    const { data: memberships } = await admin
      .from("eckcm_group_memberships")
      .select("person_id, eckcm_groups!inner(registration_id)")
      .eq("eckcm_groups.registration_id", registrationId);

    if (memberships && memberships.length > 0) {
      const personIds = memberships.map((m) => m.person_id);
      const { data: existingTokens } = await admin
        .from("eckcm_epass_tokens")
        .select("person_id")
        .eq("registration_id", registrationId)
        .in("person_id", personIds);

      const existingSet = new Set((existingTokens ?? []).map((t) => t.person_id));
      const newTokens = memberships
        .filter((m) => !existingSet.has(m.person_id))
        .map((m) => {
          const { token, tokenHash } = generateEPassToken();
          return {
            person_id: m.person_id,
            registration_id: registrationId,
            token,
            token_hash: tokenHash,
            is_active: true,
          };
        });

      if (newTokens.length > 0) {
        await admin.from("eckcm_epass_tokens").insert(newTokens);
      }
    }

    // Update inventory counts
    await recalculateInventorySafe(admin);

    // Send confirmation email
    after(async () => {
      try {
        await sendConfirmationEmail(registrationId);
      } catch (err) {
        logger.error("[stripe/webhook] Failed to send confirmation email", {
          registrationId,
          error: String(err),
        });
      }
    });

    return NextResponse.json({ received: true });
  }

  // ── payment_intent.payment_failed ─────────────────────────────────
  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;

    // ── Donation payment failures ──
    if (pi.metadata?.type === "donation" && pi.metadata?.donationId) {
      const donationId = pi.metadata.donationId;
      const failMessage = pi.last_payment_error?.message || "Payment failed";

      logger.warn("[stripe/webhook] Donation payment failed", {
        donationId,
        piId: pi.id,
        failMessage,
      });

      await admin
        .from("eckcm_donations")
        .update({
          status: "FAILED",
          metadata: {
            stripe_payment_method: pi.payment_method,
            confirmed_by: "webhook",
            fail_reason: failMessage,
          },
        })
        .eq("id", donationId);

      return NextResponse.json({ received: true });
    }

    // ── Registration payment failures ──
    const registrationId = pi.metadata?.registrationId;
    const invoiceId = pi.metadata?.invoiceId;

    if (!registrationId) {
      return NextResponse.json({ received: true });
    }

    const failMessage =
      pi.last_payment_error?.message || "Payment failed";

    logger.warn("[stripe/webhook] Payment failed", {
      registrationId,
      piId: pi.id,
      failMessage,
    });

    // Cancel registration when payment fails
    // Handles both SUBMITTED (new flow) and PAID (old flow that incorrectly marked ACH as PAID)
    const { data: registration } = await admin
      .from("eckcm_registrations")
      .select("id, status")
      .eq("id", registrationId)
      .single();

    if (registration && (registration.status === "SUBMITTED" || registration.status === "PAID")) {
      logger.warn("[stripe/webhook] Cancelling registration — payment failed", {
        registrationId,
        previousStatus: registration.status,
        piId: pi.id,
      });
      await admin
        .from("eckcm_registrations")
        .update({ status: "CANCELLED" })
        .eq("id", registrationId);
    }

    // Update payment record to FAILED
    await admin
      .from("eckcm_payments")
      .update({
        status: "FAILED",
        metadata: {
          stripe_payment_method: pi.payment_method,
          confirmed_by: "webhook",
          fail_reason: failMessage,
        },
      })
      .eq("stripe_payment_intent_id", pi.id);

    if (invoiceId) {
      await admin
        .from("eckcm_invoices")
        .update({ status: "FAILED" })
        .eq("id", invoiceId);
    }

    // Update inventory counts (registration cancelled)
    await recalculateInventorySafe(admin);

    return NextResponse.json({ received: true });
  }

  // Other event types — acknowledge but don't process
  return NextResponse.json({ received: true });
}
