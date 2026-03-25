import { after } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEPassToken } from "@/lib/services/epass.service";
import { zelleSubmitSchema } from "@/lib/schemas/api";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";
import { getStripeForMode } from "@/lib/stripe/config";
import { logger } from "@/lib/logger";
import { recalculateInventorySafe } from "@/lib/services/inventory.service";

export async function POST(request: Request) {
  try {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = zelleSubmitSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { registrationId } = parsed.data;

  const admin = createAdminClient();

  // Load registration and verify ownership
  const { data: registration } = await admin
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
  if (registration.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Registration is not payable in status ${registration.status}` },
      { status: 409 }
    );
  }

  // Load invoice
  const { data: invoice } = await admin
    .from("eckcm_invoices")
    .select("id, total_cents")
    .eq("registration_id", registrationId)
    .single();

  if (!invoice) {
    return NextResponse.json(
      { error: "Invoice not found" },
      { status: 404 }
    );
  }

  // Calculate manual payment discount
  let discountCents = 0;
  {
    const { data: regData } = await admin
      .from("eckcm_registrations")
      .select("registration_group_id")
      .eq("id", registrationId)
      .single();
    if (regData?.registration_group_id) {
      const { data: discountFee } = await admin
        .from("eckcm_registration_group_fee_categories")
        .select("eckcm_fee_categories!inner(amount_cents)")
        .eq("registration_group_id", regData.registration_group_id)
        .eq("eckcm_fee_categories.code", "MANUAL_PAYMENT_DISCOUNT")
        .maybeSingle();
      const discountPerPerson = (discountFee as any)?.eckcm_fee_categories?.amount_cents ?? 0;
      if (discountPerPerson > 0) {
        // Count participants
        const { count } = await admin
          .from("eckcm_group_memberships")
          .select("id", { count: "exact", head: true })
          .in(
            "group_id",
            (await admin.from("eckcm_groups").select("id").eq("registration_id", registrationId)).data?.map((g: { id: string }) => g.id) ?? []
          );
        discountCents = discountPerPerson * (count ?? 0);
      }
    }
  }

  // Apply discount: add negative line item and update invoice total
  const discountedTotal = Math.max(0, invoice.total_cents - discountCents);
  if (discountCents > 0) {
    await admin.from("eckcm_invoice_line_items").insert({
      invoice_id: invoice.id,
      description_en: "Manual Payment Discount (Zelle)",
      description_ko: "수동 결제 할인 (Zelle)",
      quantity: 1,
      unit_price_cents: -discountCents,
      total_cents: -discountCents,
      sort_order: 999,
    });
    await admin
      .from("eckcm_invoices")
      .update({ total_cents: discountedTotal })
      .eq("id", invoice.id);
    await admin
      .from("eckcm_registrations")
      .update({ total_amount_cents: discountedTotal })
      .eq("id", registrationId);
  }

  // Cancel any orphaned Stripe PaymentIntents (created if user visited card form first)
  const { data: pendingCardPayments } = await admin
    .from("eckcm_payments")
    .select("id, stripe_payment_intent_id")
    .eq("invoice_id", invoice.id)
    .eq("status", "PENDING")
    .not("stripe_payment_intent_id", "is", null);

  if (pendingCardPayments && pendingCardPayments.length > 0) {
    try {
      const { data: event } = await admin
        .from("eckcm_events")
        .select("stripe_mode")
        .eq("id", registration.event_id)
        .single();
      const stripe = await getStripeForMode(
        (event?.stripe_mode as "test" | "live") ?? "test"
      );
      for (const payment of pendingCardPayments) {
        if (payment.stripe_payment_intent_id) {
          try {
            await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);
          } catch (err) {
            logger.warn("[payment/zelle-submit] Failed to cancel Stripe PI", {
              piId: payment.stripe_payment_intent_id,
              error: String(err),
            });
          }
        }
        await admin.from("eckcm_payments").delete().eq("id", payment.id);
      }
      logger.info("[payment/zelle-submit] Cleaned up orphaned Stripe payments", {
        count: pendingCardPayments.length,
      });
    } catch (err) {
      logger.warn("[payment/zelle-submit] Error cleaning up Stripe payments", {
        error: String(err),
      });
    }
  }

  // Create ZELLE payment record
  const { error: paymentInsertError } = await admin.from("eckcm_payments").insert({
    invoice_id: invoice.id,
    payment_method: "ZELLE",
    amount_cents: discountedTotal,
    status: "PENDING",
  });
  if (paymentInsertError) {
    logger.error("[payment/zelle-submit] Failed to create payment record", {
      error: String(paymentInsertError),
    });
    return NextResponse.json(
      { error: "Failed to create payment record" },
      { status: 500 }
    );
  }

  // Update registration status to SUBMITTED
  const { error: registrationUpdateError } = await admin
    .from("eckcm_registrations")
    .update({ status: "SUBMITTED" })
    .eq("id", registrationId);
  if (registrationUpdateError) {
    logger.error("[payment/zelle-submit] Failed to update registration", {
      error: String(registrationUpdateError),
    });
    return NextResponse.json(
      { error: "Failed to update registration" },
      { status: 500 }
    );
  }

  // Generate E-Pass tokens with is_active = false (activated when admin confirms payment)
  const { data: memberships } = await admin
    .from("eckcm_group_memberships")
    .select("person_id, eckcm_groups!inner(registration_id)")
    .eq("eckcm_groups.registration_id", registrationId);

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
          is_active: false,
        };
      });

    if (newTokens.length > 0) {
      const { error: insertError } = await admin
        .from("eckcm_epass_tokens")
        .insert(newTokens);
      if (insertError) {
        logger.error("[payment/zelle-submit] Failed to insert epass tokens", { error: String(insertError) });
      } else {
        tokensGenerated = newTokens.length;
      }
    }
  }
  logger.info("[payment/zelle-submit] Inactive E-Pass tokens generated", { tokensGenerated });

  // Send email with Zelle payment instructions (non-blocking — runs after response to avoid timeout)
  after(async () => {
    try {
      await sendConfirmationEmail(registrationId, null, { paymentMethod: "ZELLE" });
    } catch (err) {
      logger.error("[payment/zelle-submit] Failed to send Zelle instructions email", { error: String(err) });
    }
  });

  // Update inventory counts
  await recalculateInventorySafe(admin);

  // Audit log
  await admin.from("eckcm_audit_logs").insert({
    user_id: user.id,
    action: "ZELLE_PAYMENT_SUBMITTED",
    entity_type: "registration",
    entity_id: registrationId,
    new_data: {
      confirmation_code: registration.confirmation_code,
      amount_cents: discountedTotal,
      discount_cents: discountCents,
      payment_method: "ZELLE",
      epass_tokens_generated: tokensGenerated,
    },
  });

  return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[payment/zelle-submit] Unhandled error", { error: String(err) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
