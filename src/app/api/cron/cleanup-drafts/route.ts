import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { deleteDraftRegistration } from "@/lib/services/registration.service";
import { logger } from "@/lib/logger";

const MAX_AGE_HOURS = 1;

/**
 * Cron job: clean up abandoned DRAFT registrations and their Stripe PaymentIntents.
 *
 * - Finds DRAFT registrations older than MAX_AGE_HOURS
 * - Cancels any associated PENDING Stripe PaymentIntents
 * - Deletes the DRAFT registrations and all related records
 *
 * Secured via CRON_SECRET env var (Vercel Cron sets Authorization header).
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();

  // Find stale DRAFT registrations
  const { data: staleDrafts, error: findError } = await admin
    .from("eckcm_registrations")
    .select("id, event_id")
    .eq("status", "DRAFT")
    .lt("created_at", cutoff);

  if (findError) {
    logger.error("[cron/cleanup-drafts] Failed to query stale drafts", {
      error: String(findError),
    });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!staleDrafts || staleDrafts.length === 0) {
    return NextResponse.json({ cleaned: 0 });
  }

  logger.info("[cron/cleanup-drafts] Found stale drafts", {
    count: staleDrafts.length,
  });

  // Pre-load stripe modes for events
  const eventIds = [...new Set(staleDrafts.map((d) => d.event_id))];
  const { data: events } = await admin
    .from("eckcm_events")
    .select("id, stripe_mode")
    .in("id", eventIds);
  const eventModeMap = new Map(
    (events ?? []).map((e) => [e.id, (e.stripe_mode as "test" | "live") ?? "test"])
  );

  let cleaned = 0;
  let piCancelled = 0;

  for (const draft of staleDrafts) {
    try {
      // Find and cancel associated Stripe PaymentIntents
      const { data: invoices } = await admin
        .from("eckcm_invoices")
        .select("id")
        .eq("registration_id", draft.id);

      const invoiceIds = (invoices ?? []).map((i) => i.id);

      if (invoiceIds.length > 0) {
        const { data: payments } = await admin
          .from("eckcm_payments")
          .select("stripe_payment_intent_id")
          .in("invoice_id", invoiceIds)
          .eq("status", "PENDING");

        const stripeMode = eventModeMap.get(draft.event_id) ?? "test";

        for (const payment of payments ?? []) {
          if (payment.stripe_payment_intent_id) {
            try {
              const stripe = await getStripeForMode(stripeMode);
              await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);
              piCancelled++;
            } catch (err) {
              // PI may already be cancelled/expired — not critical
              logger.warn("[cron/cleanup-drafts] Failed to cancel PI", {
                piId: payment.stripe_payment_intent_id,
                error: String(err),
              });
            }
          }
        }
      }

      // Delete the DRAFT registration and all related records
      await deleteDraftRegistration(admin, draft.id);
      cleaned++;
    } catch (err) {
      logger.error("[cron/cleanup-drafts] Failed to clean draft", {
        registrationId: draft.id,
        error: String(err),
      });
    }
  }

  logger.info("[cron/cleanup-drafts] Cleanup complete", {
    cleaned,
    piCancelled,
    total: staleDrafts.length,
  });

  return NextResponse.json({ cleaned, piCancelled });
}
