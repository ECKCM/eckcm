import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

let _stripe: Stripe | null = null;

const _stripeByMode: Record<string, Stripe> = {};

/**
 * Lazy-loaded Stripe server client using env vars.
 * Fallback for when mode-based resolution is not needed.
 */
export function getStripeServer(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return _stripe;
}

/**
 * Get a Stripe server instance for a specific mode (test/live).
 * Fetches secret key from eckcm_app_config and caches per mode.
 * Falls back to env var if DB key is not set.
 */
export async function getStripeForMode(
  mode: "test" | "live"
): Promise<Stripe> {
  if (_stripeByMode[mode]) return _stripeByMode[mode];

  const admin = createAdminClient();
  const field =
    mode === "live" ? "stripe_live_secret_key" : "stripe_test_secret_key";

  const { data } = await admin
    .from("eckcm_app_config")
    .select("stripe_test_secret_key, stripe_live_secret_key")
    .eq("id", 1)
    .single();

  const secretKey = (data as Record<string, string | null> | null)?.[field];

  if (!secretKey) {
    // Fallback to env var
    return getStripeServer();
  }

  _stripeByMode[mode] = new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });

  return _stripeByMode[mode];
}

/**
 * Clear cached Stripe instances (useful when keys are updated).
 */
export function clearStripeCache() {
  _stripe = null;
  delete _stripeByMode["test"];
  delete _stripeByMode["live"];
}
