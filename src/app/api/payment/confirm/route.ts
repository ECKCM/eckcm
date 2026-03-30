import { after } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { generateEPassToken } from "@/lib/services/epass.service";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";
import { confirmPaymentSchema } from "@/lib/schemas/api";
import { logger } from "@/lib/logger";
import { recalculateInventorySafe } from "@/lib/services/inventory.service";
import { insertInitialPayment } from "@/lib/services/adjustment.service";
import { syncRegistration } from "@/lib/services/google-sheets.service";

/**
 * Generate E-Pass tokens and send confirmation email for a registration.
 * Extracted so it can be called for both fresh confirmations and idempotent retries.
 */
async function generateEPassAndSendEmail(
  admin: ReturnType<typeof createAdminClient>,
  registrationId: string
) {
  // Generate E-Pass tokens
  const { data: memberships, error: membershipError } = await admin
    .from("eckcm_group_memberships")
    .select("person_id, eckcm_groups!inner(registration_id)")
    .eq("eckcm_groups.registration_id", registrationId);

  if (membershipError) {
    logger.error("[payment/confirm] Failed to load memberships", { error: String(membershipError) });
  }

  let tokensGenerated = 0;
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
      const { error: insertError } = await admin
        .from("eckcm_epass_tokens")
        .insert(newTokens);
      if (insertError) {
        logger.error("[payment/confirm] Failed to insert epass tokens", { error: String(insertError) });
      } else {
        tokensGenerated = newTokens.length;
      }
    }
  }
  logger.info("[payment/confirm] E-Pass tokens generated", { tokensGenerated, totalMembers: memberships?.length ?? 0 });

  // Send confirmation email (non-blocking — runs after response to avoid timeout)
  after(async () => {
    try {
      await sendConfirmationEmail(registrationId);
    } catch (err) {
      logger.error("[payment/confirm] Failed to send confirmation email", { error: String(err) });
    }
  });
}

export async function POST(request: Request) {
  try {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = confirmPaymentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { registrationId, paymentIntentId } = parsed.data;

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

  // Already paid — idempotent: still ensure e-pass tokens exist and email is sent
  if (registration.status === "PAID") {
    await generateEPassAndSendEmail(admin, registrationId);
    return NextResponse.json({ status: "already_confirmed" });
  }
  if (registration.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Registration is not confirmable in status ${registration.status}` },
      { status: 409 }
    );
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

  const isSucceeded = paymentIntent.status === "succeeded";

  if (!isSucceeded) {
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
  if (paymentIntent.metadata.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invoiceId = paymentIntent.metadata.invoiceId;

    const { error: registrationError, data: registrationData } = await admin
      .from("eckcm_registrations")
      .update({ status: "PAID" })
      .select("id")
      .eq("id", registrationId);

    if (registrationError || !registrationData?.length) {
      logger.error("[payment/confirm] Failed to update registration to PAID", {
        registrationId,
        error: registrationError ? String(registrationError) : "no rows updated",
      });
      return NextResponse.json(
        { error: "Failed to finalize payment" },
        { status: 500 }
      );
    }

    // Insert initial_payment adjustment (idempotent)
    await insertInitialPayment(admin, {
      registrationId,
      totalAmountCents: paymentIntent.amount ?? 0,
      stripePaymentIntentId: paymentIntentId,
      adjustedBy: user.id,
      source: "payment_confirm",
    });

    // Update payment and invoice
    const [paymentUpdate, invoiceUpdate] = await Promise.all([
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
            confirmed_by: "client",
          },
        })
        .select("id")
        .eq("stripe_payment_intent_id", paymentIntentId),
      invoiceId
        ? admin
            .from("eckcm_invoices")
            .update({ status: "SUCCEEDED", paid_at: new Date().toISOString() })
            .select("id")
            .eq("id", invoiceId)
        : Promise.resolve(null),
    ]);

    if (paymentUpdate.error || !paymentUpdate.data?.length) {
      logger.warn("[payment/confirm] Payment record update issue (non-blocking)", {
        registrationId,
        paymentIntentId,
        error: paymentUpdate.error ? String(paymentUpdate.error) : "no matching payment row",
      });
    }
    if (invoiceId && (invoiceUpdate?.error || !invoiceUpdate?.data?.length)) {
      logger.warn("[payment/confirm] Invoice update issue (non-blocking)", {
        registrationId,
        invoiceId,
        error: invoiceUpdate?.error ? String(invoiceUpdate.error) : "no matching invoice row",
      });
    }

    // Generate E-Pass tokens and send email
    await generateEPassAndSendEmail(admin, registrationId);

    // Update inventory counts
    await recalculateInventorySafe(admin);

    // Sync to Google Sheets
    syncRegistration(registration.event_id, registrationId).catch((err) =>
      logger.error("[payment/confirm] Google Sheets sync failed", { error: String(err) })
    );

    return NextResponse.json({ status: "confirmed" });
  } catch (err) {
    logger.error("[payment/confirm] Unhandled error", { error: String(err) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
