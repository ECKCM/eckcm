import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { linkCreateIntentSchema } from "@/lib/schemas/api";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/** Card processing fee: 2.9% + $0.30 (matches the rest of the payment flow). */
function calcAmountWithFees(baseCents: number): number {
  return Math.ceil((baseCents + 30) / (1 - 0.029));
}

/**
 * Token-authorized PaymentIntent creation for a SUBMITTED registration paying by
 * card via the self-service link. NO session required — the random link token is
 * the credential. Reverses the manual-payment discount (card pays full price),
 * supersedes the pending offline payment, and creates a card-only PI.
 */
export async function POST(request: Request) {
  try {
    const parsed = linkCreateIntentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { token, coversFees } = parsed.data;

    const rl = rateLimit(`link-create-intent:${token.slice(0, 16)}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const admin = createAdminClient();

    // Resolve registration by token hash (raw token never hits the query/logs).
    const { data: registration } = await admin
      .from("eckcm_registrations")
      .select("id, status, event_id, confirmation_code, payment_link_expires_at")
      .eq("payment_link_token_hash", tokenHash)
      .maybeSingle();

    if (!registration) {
      return NextResponse.json({ error: "Invalid or expired payment link" }, { status: 404 });
    }

    if (
      registration.payment_link_expires_at &&
      new Date(registration.payment_link_expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json({ error: "Payment link expired" }, { status: 410 });
    }

    if (registration.status === "PAID") {
      return NextResponse.json({ alreadyPaid: true });
    }
    if (registration.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: `This registration cannot be paid in status ${registration.status}` },
        { status: 409 }
      );
    }

    // Load latest non-REFUNDED invoice.
    const { data: invoice } = await admin
      .from("eckcm_invoices")
      .select("id, total_cents, status")
      .eq("registration_id", registration.id)
      .neq("status", "REFUNDED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.status === "SUCCEEDED") {
      return NextResponse.json({ alreadyPaid: true });
    }

    // --- Reverse manual-payment discount → card list price (idempotent) ---
    // Zelle/Check submit added a negative discount line item (sort_order 999) and
    // lowered the invoice total. Card pays full price, so remove it and recompute.
    await admin
      .from("eckcm_invoice_line_items")
      .delete()
      .eq("invoice_id", invoice.id)
      .eq("sort_order", 999)
      .lt("total_cents", 0);

    const { data: lineItems } = await admin
      .from("eckcm_invoice_line_items")
      .select("total_cents")
      .eq("invoice_id", invoice.id);

    const fullPriceCents = (lineItems ?? []).reduce(
      (sum: number, li: { total_cents: number | null }) => sum + (li.total_cents ?? 0),
      0
    );

    if (fullPriceCents <= 0) {
      return NextResponse.json({ error: "Invalid payment amount" }, { status: 400 });
    }

    // Persist recomputed full price for THIS invoice.
    await admin.from("eckcm_invoices").update({ total_cents: fullPriceCents }).eq("id", invoice.id);

    // Registration total = SUM of all non-refunded invoices (this one + any already
    // paid, e.g. the original when settling a separate Custom Charge). Writing only
    // this invoice's total would drop the already-paid portion and corrupt the total.
    const { data: regInvoices } = await admin
      .from("eckcm_invoices")
      .select("total_cents")
      .eq("registration_id", registration.id)
      .neq("status", "REFUNDED");
    const regTotalCents = (regInvoices ?? []).reduce(
      (sum: number, iv: { total_cents: number | null }) => sum + (iv.total_cents ?? 0),
      0
    );
    await admin
      .from("eckcm_registrations")
      .update({ total_amount_cents: regTotalCents })
      .eq("id", registration.id);

    // Load event mode + publishable key.
    const { data: event } = await admin
      .from("eckcm_events")
      .select("name_en, stripe_mode, payment_test_mode")
      .eq("id", registration.event_id)
      .single();

    const stripeMode = (event?.stripe_mode as "test" | "live") ?? "test";
    const paymentTestMode = event?.payment_test_mode === true;

    const { data: appConfig } = await admin
      .from("eckcm_app_config")
      .select("stripe_test_publishable_key, stripe_live_publishable_key")
      .eq("id", 1)
      .single();
    const publishableKey =
      (appConfig as Record<string, string | null> | null)?.[
        stripeMode === "live" ? "stripe_live_publishable_key" : "stripe_test_publishable_key"
      ] || null;

    const baseChargeAmount = paymentTestMode ? 100 : fullPriceCents;
    const chargeAmount = coversFees ? calcAmountWithFees(baseChargeAmount) : baseChargeAmount;

    const stripe = await getStripeForMode(stripeMode);

    // --- Supersede pending offline payment; consider reusing a pending card PI ---
    const { data: pendingPayments } = await admin
      .from("eckcm_payments")
      .select("id, payment_method, stripe_payment_intent_id")
      .eq("invoice_id", invoice.id)
      .eq("status", "PENDING");

    let reusablePiId: string | null = null;
    for (const p of pendingPayments ?? []) {
      const method = (p.payment_method ?? "").toUpperCase();
      if (method === "CARD" && p.stripe_payment_intent_id) {
        reusablePiId = p.stripe_payment_intent_id;
      } else {
        // Offline pending payment (ZELLE/CHECK/MANUAL) — no money moved; supersede it.
        await admin.from("eckcm_payments").delete().eq("id", p.id);
      }
    }

    if (reusablePiId) {
      try {
        const existing = await stripe.paymentIntents.retrieve(reusablePiId);
        if (
          existing.status === "requires_payment_method" ||
          existing.status === "requires_confirmation" ||
          existing.status === "requires_action"
        ) {
          const updated = await stripe.paymentIntents.update(existing.id, { amount: chargeAmount });
          await admin
            .from("eckcm_payments")
            .update({ amount_cents: chargeAmount })
            .eq("stripe_payment_intent_id", existing.id);
          return NextResponse.json({
            clientSecret: updated.client_secret,
            publishableKey,
            amount: chargeAmount,
            baseCents: baseChargeAmount,
            coversFees: !!coversFees,
            paymentTestMode,
          });
        }
        if (existing.status !== "succeeded" && existing.status !== "canceled") {
          await stripe.paymentIntents.cancel(existing.id).catch(() => {});
        }
        await admin
          .from("eckcm_payments")
          .update({ status: "FAILED" })
          .eq("stripe_payment_intent_id", existing.id)
          .eq("status", "PENDING");
      } catch {
        await admin
          .from("eckcm_payments")
          .update({ status: "FAILED" })
          .eq("stripe_payment_intent_id", reusablePiId)
          .eq("status", "PENDING");
      }
    }

    // Create a fresh card-only PaymentIntent. NO userId in metadata (no session).
    const paymentIntent = await stripe.paymentIntents.create({
      amount: chargeAmount,
      currency: "usd",
      description: `${event?.name_en ?? "ECKCM"} Registration`,
      metadata: {
        registrationId: registration.id,
        invoiceId: invoice.id,
        confirmationCode: registration.confirmation_code ?? "",
        coversFees: coversFees ? "true" : "false",
        type: "registration",
        source: "payment_link",
      },
      payment_method_configuration:
        stripeMode === "live"
          ? "pmc_1TIYrzAHIcy4RD4RUlTrBtlE"
          : "pmc_1TIYtSAHIcy4RD4R0iMHaWJu",
    });

    const { error: insertError } = await admin.from("eckcm_payments").insert({
      invoice_id: invoice.id,
      stripe_payment_intent_id: paymentIntent.id,
      payment_method: "CARD",
      amount_cents: chargeAmount,
      status: "PENDING",
    });
    if (insertError) {
      logger.error("[payment/link/create-intent] Failed to insert payment record", {
        error: String(insertError),
      });
      await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => {});
      return NextResponse.json({ error: "Failed to create payment record" }, { status: 500 });
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      publishableKey,
      amount: chargeAmount,
      baseCents: baseChargeAmount,
      coversFees: !!coversFees,
      paymentTestMode,
    });
  } catch (err) {
    logger.error("[payment/link/create-intent] Unhandled error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
