import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { getMealUnitPriceCents } from "@/lib/services/meal-pass.service";
import { mealPassRequestEditSchema } from "@/lib/schemas/api";
import { writeAuditLog } from "@/lib/services/audit.service";
import { logger } from "@/lib/logger";

type Row = {
  id: string;
  status: string;
  amount_cents: number;
  payment_method: string | null;
  stripe_payment_intent_id: string | null;
  payer_name: string | null;
  payer_email: string | null;
  metadata: Record<string, unknown> | null;
};

async function loadRequest(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data } = await admin
    .from("eckcm_custom_payments")
    .select(
      "id, status, amount_cents, payment_method, stripe_payment_intent_id, payer_name, payer_email, metadata"
    )
    .eq("id", id)
    .eq("metadata->>kind", "meal_pass_onsite_request")
    .maybeSingle();
  return (data as Row | null) ?? null;
}

/**
 * PATCH /api/admin/meal-passes/{id}
 *
 * Edits a meal-pass REQUEST (eckcm_custom_payments tagged
 * `meal_pass_onsite_request`). Buyer contact is always editable. Tier counts
 * recompute the amount from server-side prices — but for card-paid (Stripe-
 * linked) requests the counts/amount are LOCKED (the card was already charged),
 * so changing them is rejected. Gated by requireAdmin().
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = mealPassRequestEditSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { payerName, payerEmail, payerPhone, churchName, general, youth } = parsed.data;

  const { id } = await params;
  const admin = createAdminClient();

  const row = await loadRequest(admin, id);
  if (!row) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const meta = row.metadata ?? {};
  const curGeneral = (meta.general as number) ?? 0;
  const curYouth = (meta.youth as number) ?? 0;
  // Card-paid requests carry a Stripe charge → the amount is fixed.
  const locked = !!row.stripe_payment_intent_id;
  const countsChanged = general !== curGeneral || youth !== curYouth;

  if (locked && countsChanged) {
    return NextResponse.json(
      {
        error:
          "Counts are locked for card-paid requests (the card was already charged). Edit the buyer info only, or void and recreate.",
      },
      { status: 409 }
    );
  }

  // Recompute amount + items from server-side prices for editable (non-card)
  // requests. Locked requests keep their charged amount and items untouched.
  let amountCents = row.amount_cents;
  let items = (meta.items as unknown[]) ?? [];
  if (!locked) {
    const [generalPrice, youthPrice] = await Promise.all([
      general > 0 ? getMealUnitPriceCents(admin, "MEAL_GENERAL") : Promise.resolve(0),
      youth > 0 ? getMealUnitPriceCents(admin, "MEAL_YOUTH") : Promise.resolve(0),
    ]);
    if ((general > 0 && generalPrice == null) || (youth > 0 && youthPrice == null)) {
      return NextResponse.json(
        { error: "Meal pricing is not configured for a selected tier" },
        { status: 400 }
      );
    }
    items = [
      general > 0
        ? { tierCode: "MEAL_GENERAL", quantity: general, unitCents: generalPrice ?? 0 }
        : null,
      youth > 0
        ? { tierCode: "MEAL_YOUTH", quantity: youth, unitCents: youthPrice ?? 0 }
        : null,
    ].filter(Boolean) as { tierCode: string; quantity: number; unitCents: number }[];
    amountCents = (items as { quantity: number; unitCents: number }[]).reduce(
      (sum, it) => sum + it.quantity * it.unitCents,
      0
    );
  }

  const newMeta: Record<string, unknown> = {
    ...meta,
    general,
    youth,
    items,
    edited_by_user_id: adminAuth.user.id,
  };
  if (payerPhone && payerPhone.trim()) newMeta.payer_phone = payerPhone.trim();
  else delete newMeta.payer_phone;
  if (churchName && churchName.trim()) newMeta.church_name = churchName.trim();
  else delete newMeta.church_name;

  const { error: upErr } = await admin
    .from("eckcm_custom_payments")
    .update({
      payer_name: payerName?.trim() || null,
      payer_email: payerEmail?.trim() || null,
      amount_cents: amountCents,
      metadata: newMeta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (upErr) {
    logger.error("[admin/meal-passes/edit] failed", { id, error: upErr.message });
    return NextResponse.json({ error: "Failed to save changes" }, { status: 500 });
  }

  await writeAuditLog(admin, {
    event_id: (meta.event_id as string | null) ?? null,
    user_id: adminAuth.user.id,
    action: "MEAL_PASS_REQUEST_EDITED",
    entity_type: "meal_pass_request",
    entity_id: id,
    old_data: {
      general: curGeneral,
      youth: curYouth,
      amount_cents: row.amount_cents,
      payer_name: row.payer_name,
      payer_email: row.payer_email,
    },
    new_data: { general, youth, amount_cents: amountCents },
  });

  return NextResponse.json({ status: "updated" });
}

/**
 * DELETE /api/admin/meal-passes/{id}
 *
 * Permanently removes a meal-pass REQUEST. Money-safety (memory: Stripe PI
 * Safety): a Stripe-linked request is verified against Stripe first — if its
 * PaymentIntent actually SUCCEEDED, deletion is refused (void/refund instead, so
 * the captured payment is never silently lost). Desk requests and abandoned
 * (un-captured) card attempts delete cleanly. Gated by requireAdmin().
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const row = await loadRequest(admin, id);
  if (!row) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  // Verify Stripe-linked requests against Stripe before deleting — never trust
  // the local status for money-linked rows.
  if (row.stripe_payment_intent_id) {
    const { data: event } = await admin
      .from("eckcm_events")
      .select("stripe_mode")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const stripeMode = (event?.stripe_mode as "test" | "live") ?? "test";
    try {
      const stripe = await getStripeForMode(stripeMode);
      const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
      if (pi.status === "succeeded") {
        return NextResponse.json(
          {
            error:
              "This request has a captured card payment. Refund it in Stripe, then void the request instead of deleting.",
          },
          { status: 409 }
        );
      }
    } catch (err) {
      logger.error("[admin/meal-passes/delete] Stripe verify failed", {
        id,
        error: String(err),
      });
      return NextResponse.json(
        { error: "Could not verify the card payment with Stripe. Try again." },
        { status: 502 }
      );
    }
  }

  const meta = row.metadata ?? {};
  const { error: delErr } = await admin
    .from("eckcm_custom_payments")
    .delete()
    .eq("id", id);

  if (delErr) {
    logger.error("[admin/meal-passes/delete] failed", { id, error: delErr.message });
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }

  await writeAuditLog(admin, {
    event_id: (meta.event_id as string | null) ?? null,
    user_id: adminAuth.user.id,
    action: "MEAL_PASS_REQUEST_DELETED",
    entity_type: "meal_pass_request",
    entity_id: id,
    old_data: {
      status: row.status,
      amount_cents: row.amount_cents,
      general: meta.general ?? 0,
      youth: meta.youth ?? 0,
      payment_method: row.payment_method,
    },
  });

  return NextResponse.json({ status: "deleted" });
}
