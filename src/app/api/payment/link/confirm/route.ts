import { after } from "next/server";
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { generateEPassToken } from "@/lib/services/epass.service";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";
import { linkConfirmSchema } from "@/lib/schemas/api";
import { logger } from "@/lib/logger";
import { recalculateInventorySafe } from "@/lib/services/inventory.service";
import { insertInitialPayment } from "@/lib/services/adjustment.service";
import { syncRegistration } from "@/lib/services/google-sheets.service";

/**
 * Activate the registration's existing (inactive) E-Pass tokens, generate any
 * missing ones, and send the confirmation email. Mirrors admin/payment/manual —
 * SUBMITTED registrations already have inactive tokens, so explicit activation
 * is required (the DRAFT confirm flow only inserts missing tokens).
 */
async function activateAndIssueEPass(
  admin: ReturnType<typeof createAdminClient>,
  registrationId: string
) {
  const { data: memberships } = await admin
    .from("eckcm_group_memberships")
    .select("person_id, eckcm_groups!inner(registration_id)")
    .eq("eckcm_groups.registration_id", registrationId);

  if (memberships && memberships.length > 0) {
    await admin
      .from("eckcm_epass_tokens")
      .update({ is_active: true })
      .eq("registration_id", registrationId)
      .eq("is_active", false);

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
      const { error } = await admin.from("eckcm_epass_tokens").insert(newTokens);
      if (error) {
        logger.error("[payment/link/confirm] Failed to insert epass tokens", {
          error: String(error),
        });
      }
    }
  }

  after(async () => {
    try {
      await sendConfirmationEmail(registrationId);
    } catch (err) {
      logger.error("[payment/link/confirm] Failed to send confirmation email", {
        error: String(err),
      });
    }
  });
}

/**
 * Token-authorized finalization of a card payment made via the self-service link.
 * NO session — the link token is the credential. Verifies the PI with Stripe,
 * atomically moves SUBMITTED → PAID, writes the ledger, activates E-Pass, and
 * consumes (clears) the one-time token.
 */
export async function POST(request: Request) {
  try {
    const parsed = linkConfirmSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { token, paymentIntentId } = parsed.data;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const admin = createAdminClient();

    const { data: registration } = await admin
      .from("eckcm_registrations")
      .select("id, status, event_id, created_by_user_id")
      .eq("payment_link_token_hash", tokenHash)
      .maybeSingle();

    if (!registration) {
      return NextResponse.json({ error: "Invalid payment link" }, { status: 404 });
    }

    // Idempotent: already paid → ensure tokens active + email, return success.
    if (registration.status === "PAID") {
      await activateAndIssueEPass(admin, registration.id);
      return NextResponse.json({ status: "already_confirmed" });
    }
    if (registration.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: `Registration is not confirmable in status ${registration.status}` },
        { status: 409 }
      );
    }

    // Verify the PaymentIntent with Stripe — trust Stripe, never local state.
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
    if (paymentIntent.metadata.registrationId !== registration.id) {
      return NextResponse.json(
        { error: "PaymentIntent does not match registration" },
        { status: 400 }
      );
    }

    const invoiceId = paymentIntent.metadata.invoiceId;

    // Atomic guard: only finalize if still SUBMITTED (prevents double finalize).
    const { error: updErr, data: updData } = await admin
      .from("eckcm_registrations")
      .update({ status: "PAID" })
      .select("id")
      .eq("id", registration.id)
      .eq("status", "SUBMITTED");

    if (updErr) {
      logger.error("[payment/link/confirm] Failed to update registration to PAID", {
        registrationId: registration.id,
        error: String(updErr),
      });
      return NextResponse.json({ error: "Failed to finalize payment" }, { status: 500 });
    }
    if (!updData?.length) {
      // Concurrent confirm already finalized — idempotent success.
      await activateAndIssueEPass(admin, registration.id);
      return NextResponse.json({ status: "already_confirmed" });
    }

    // Ledger (idempotent inside); adjustedBy falls back to created_by_user_id.
    await insertInitialPayment(admin, {
      registrationId: registration.id,
      totalAmountCents: paymentIntent.amount ?? 0,
      stripePaymentIntentId: paymentIntentId,
      adjustedBy: registration.created_by_user_id ?? "",
      source: "payment_link",
    });

    await Promise.all([
      admin
        .from("eckcm_payments")
        .update({
          status: "SUCCEEDED",
          metadata: {
            stripe_payment_method: paymentIntent.payment_method,
            stripe_charge_id:
              typeof paymentIntent.latest_charge === "string"
                ? paymentIntent.latest_charge
                : null,
            confirmed_by: "payment_link",
          },
        })
        .eq("stripe_payment_intent_id", paymentIntentId),
      invoiceId
        ? admin
            .from("eckcm_invoices")
            .update({ status: "SUCCEEDED", paid_at: new Date().toISOString() })
            .eq("id", invoiceId)
        : Promise.resolve(null),
    ]);

    await activateAndIssueEPass(admin, registration.id);
    await recalculateInventorySafe(admin);
    syncRegistration(registration.event_id, registration.id).catch((err) =>
      logger.error("[payment/link/confirm] Google Sheets sync failed", { error: String(err) })
    );

    // One-time link: consume the token so it can't be reused.
    await admin
      .from("eckcm_registrations")
      .update({
        payment_link_token: null,
        payment_link_token_hash: null,
        payment_link_expires_at: null,
      })
      .eq("id", registration.id);

    await admin.from("eckcm_audit_logs").insert({
      event_id: registration.event_id,
      user_id: registration.created_by_user_id ?? null,
      action: "PAYMENT_LINK_PAID",
      entity_type: "registration",
      entity_id: registration.id,
      new_data: {
        payment_intent_id: paymentIntentId,
        amount_cents: paymentIntent.amount ?? 0,
      },
    });

    return NextResponse.json({ status: "confirmed" });
  } catch (err) {
    logger.error("[payment/link/confirm] Unhandled error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
