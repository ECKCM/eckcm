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

  // PI statuses that mean money has moved (or is about to). We MUST NOT delete
  // a DRAFT registration if any associated PI is in one of these states —
  // doing so loses the audit trail for a real charge.
  const UNSAFE_PI_STATUSES = new Set([
    "succeeded",
    "processing",
    "requires_capture",
  ]);

  let cleaned = 0;
  let piCancelled = 0;
  let skipped = 0;
  const skippedDetails: Array<{
    registrationId: string;
    piId: string;
    piStatus: string;
    amount: number | null;
  }> = [];

  for (const draft of staleDrafts) {
    try {
      // Find ALL payments for this draft (any status) — the bug we are guarding
      // against is when /api/payment/confirm never ran, so the local payment row
      // stays PENDING while Stripe has actually succeeded. We can only learn the
      // true state by asking Stripe.
      const { data: invoices } = await admin
        .from("eckcm_invoices")
        .select("id")
        .eq("registration_id", draft.id);

      const invoiceIds = (invoices ?? []).map((i) => i.id);

      let unsafeForDraft = false;

      if (invoiceIds.length > 0) {
        const { data: payments } = await admin
          .from("eckcm_payments")
          .select("stripe_payment_intent_id, status")
          .in("invoice_id", invoiceIds);

        const stripeMode = eventModeMap.get(draft.event_id) ?? "test";
        const stripe = await getStripeForMode(stripeMode);

        for (const payment of payments ?? []) {
          const piId = payment.stripe_payment_intent_id;
          if (!piId) continue;

          // Verify actual PI status in Stripe — never trust local status alone.
          let piStatus: string | null = null;
          let piAmount: number | null = null;
          try {
            const pi = await stripe.paymentIntents.retrieve(piId);
            piStatus = pi.status;
            piAmount = pi.amount ?? null;
          } catch (err) {
            logger.warn("[cron/cleanup-drafts] Could not retrieve PI from Stripe", {
              piId,
              error: String(err),
            });
            // If we can't verify, err on the side of caution — skip deletion.
            unsafeForDraft = true;
            skippedDetails.push({
              registrationId: draft.id,
              piId,
              piStatus: "UNKNOWN",
              amount: null,
            });
            continue;
          }

          if (UNSAFE_PI_STATUSES.has(piStatus)) {
            unsafeForDraft = true;
            skippedDetails.push({
              registrationId: draft.id,
              piId,
              piStatus,
              amount: piAmount,
            });
            logger.error("[cron/cleanup-drafts] ABORTED delete — PI has money-bearing status", {
              registrationId: draft.id,
              piId,
              piStatus,
              amount: piAmount,
            });
            continue;
          }

          // Safe to attempt cancellation only if PI is still cancellable.
          if (piStatus !== "canceled") {
            try {
              await stripe.paymentIntents.cancel(piId);
              piCancelled++;
            } catch (err) {
              logger.warn("[cron/cleanup-drafts] Failed to cancel PI", {
                piId,
                piStatus,
                error: String(err),
              });
            }
          }
        }
      }

      if (unsafeForDraft) {
        skipped++;
        continue;
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
    skipped,
    total: staleDrafts.length,
    skippedDetails,
  });

  return NextResponse.json({
    cleaned,
    piCancelled,
    skipped,
    skippedDetails,
  });
}
