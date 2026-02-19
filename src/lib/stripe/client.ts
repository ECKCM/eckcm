import { loadStripe, type Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null>;

const stripeByKey: Record<string, Promise<Stripe | null>> = {};

/**
 * Default Stripe client using NEXT_PUBLIC env var.
 * Fallback for when dynamic key resolution is not needed.
 */
export function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
    );
  }
  return stripePromise;
}

/**
 * Get a Stripe client for a specific publishable key.
 * Caches per key to avoid re-loading.
 */
export function getStripeWithKey(publishableKey: string) {
  if (!stripeByKey[publishableKey]) {
    stripeByKey[publishableKey] = loadStripe(publishableKey);
  }
  return stripeByKey[publishableKey];
}
