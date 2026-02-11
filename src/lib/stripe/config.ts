import Stripe from "stripe";

let _stripe: Stripe | null = null;

/**
 * Lazy-loaded Stripe server client.
 * Avoids crash during Next.js build when env vars aren't available.
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
