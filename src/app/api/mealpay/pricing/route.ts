import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMealUnitPriceCents } from "@/lib/services/meal-pass.service";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/mealpay/pricing?eventId=xxx
 *
 * Returns the per-meal unit price (cents) for each selectable tier so the
 * public /mealpay page can show a live total preview. Pricing is public info
 * (the registration page exposes it too); the authoritative charge is still
 * recomputed server-side in create-intent / onsite-submit.
 */
export async function GET(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`mealpay-pricing:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const admin = createAdminClient();
  const [general, youth] = await Promise.all([
    getMealUnitPriceCents(admin, "MEAL_GENERAL"),
    getMealUnitPriceCents(admin, "MEAL_YOUTH"),
  ]);

  return NextResponse.json({
    tiers: {
      MEAL_GENERAL: general,
      MEAL_YOUTH: youth,
    },
  });
}
