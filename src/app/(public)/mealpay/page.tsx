import { createAdminClient } from "@/lib/supabase/admin";
import { getMealUnitPriceCents } from "@/lib/services/meal-pass.service";
import { MealPayClient } from "./mealpay-client";

export const dynamic = "force-dynamic";

/**
 * Public, mobile-first one-time meal purchase page (/mealpay). A buyer picks a
 * tier (General / Youth) and a quantity of generic meal uses, pays by card or
 * on-site (Zelle / Cash / Check), and receives a disposable meal QR usable N
 * times. Server component resolves the active event + per-meal prices; the
 * client form drives the purchase steps. The authoritative charge is recomputed
 * server-side in the API routes.
 */
export default async function MealPayPage() {
  const admin = createAdminClient();

  const { data: event } = await admin
    .from("eckcm_events")
    .select("id, name_en, year")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  let general: number | null = null;
  let youth: number | null = null;
  if (event) {
    [general, youth] = await Promise.all([
      getMealUnitPriceCents(admin, "MEAL_GENERAL"),
      getMealUnitPriceCents(admin, "MEAL_YOUTH"),
    ]);
  }

  return (
    <MealPayClient
      event={
        event
          ? { id: event.id, name: event.name_en as string, year: event.year as number | null }
          : null
      }
      prices={{ MEAL_GENERAL: general, MEAL_YOUTH: youth }}
    />
  );
}
