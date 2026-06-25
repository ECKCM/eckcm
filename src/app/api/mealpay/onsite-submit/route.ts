import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mealpayOnsiteSchema } from "@/lib/schemas/api";
import { getMealUnitPriceCents } from "@/lib/services/meal-pass.service";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const METHOD_TO_PAYMENT_METHOD = {
  CARD: "CARD",
  ZELLE: "ONSITE_ZELLE",
  CASH: "ONSITE_CASH",
  CHECK: "ONSITE_CHECK",
} as const;

/**
 * Physical (pre-printed) meal-pass request, paid at the desk by Card / Zelle /
 * Cash / Check, stacking multiple tiers (e.g. General × 5 + Youth × 3).
 *
 * NO QR is issued here — the registration desk hands out PRE-PRINTED QR cards
 * (generated from /admin/print/qr-cards). This only records the AGGREGATE
 * request as a single PENDING eckcm_custom_payments row (tiers + counts in
 * metadata) so an admin can confirm payment in /admin/meal-passes and hand over
 * the right number of printed cards. No eckcm_meal_passes rows are created.
 */
export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rl = rateLimit(`mealpay-onsite:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = mealpayOnsiteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { eventId, general, youth, payerName, payerEmail, payerPhone, churchName, method } =
      parsed.data;

    const admin = createAdminClient();

    // Resolve per-meal prices server-side (never trust the client).
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

    const items = [
      general > 0
        ? { tierCode: "MEAL_GENERAL", quantity: general, unitCents: generalPrice ?? 0 }
        : null,
      youth > 0
        ? { tierCode: "MEAL_YOUTH", quantity: youth, unitCents: youthPrice ?? 0 }
        : null,
    ].filter(Boolean) as { tierCode: string; quantity: number; unitCents: number }[];

    const amountCents = items.reduce((sum, it) => sum + it.quantity * it.unitCents, 0);
    if (amountCents <= 0) {
      return NextResponse.json(
        { error: "On-site request requires a priced tier" },
        { status: 400 }
      );
    }

    const totalQty = general + youth;
    const purpose = `Meal passes — ${totalQty} pass${totalQty > 1 ? "es" : ""} (physical, ${method.toLowerCase()})`;

    const { error: payErr } = await admin.from("eckcm_custom_payments").insert({
      payer_name: payerName || null,
      payer_email: payerEmail || null,
      purpose,
      amount_cents: amountCents,
      fee_cents: 0,
      covers_fees: false,
      payment_method: METHOD_TO_PAYMENT_METHOD[method],
      status: "PENDING",
      metadata: {
        kind: "meal_pass_onsite_request",
        event_id: eventId,
        onsite_method: method,
        items,
        general,
        youth,
        ...(payerPhone ? { payer_phone: payerPhone } : {}),
        ...(churchName ? { church_name: churchName } : {}),
      },
    });

    if (payErr) {
      logger.error("[mealpay/onsite-submit] Failed to insert request", {
        error: payErr.message,
      });
      return NextResponse.json(
        { error: "Failed to create request" },
        { status: 500 }
      );
    }

    // No token/QR — pre-printed cards are handed out at the desk after approval.
    return NextResponse.json({ status: "awaiting_approval" });
  } catch (err) {
    logger.error("[mealpay/onsite-submit] Unhandled error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
