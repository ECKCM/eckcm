import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { requireSuperAdmin } from "@/lib/auth/admin";
import { logger } from "@/lib/logger";
import type Stripe from "stripe";

/**
 * Audit endpoint: find Stripe PaymentIntents in `succeeded` state whose
 * `metadata.registrationId` no longer points to a row in `eckcm_registrations`.
 *
 * Background: a regression in `/api/cron/cleanup-drafts` was deleting DRAFT
 * registrations even when an associated PaymentIntent had already moved to
 * `succeeded`. The cron's `stripe.paymentIntents.cancel(...)` would fail (you
 * can't cancel a succeeded PI), the failure was logged as a warning, and the
 * registration row was deleted anyway — leaving the customer's money in Stripe
 * with no DB trail. This endpoint locates those orphan PIs so they can be
 * refunded or manually recovered.
 *
 * SUPER_ADMIN only. Read-only: never mutates Stripe or DB.
 *
 * Body:
 *   { mode?: "live" | "test", daysBack?: number (default 180) }
 */
export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth) {
    return NextResponse.json(
      { error: "Only SUPER_ADMIN can run audits" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const mode: "test" | "live" = body?.mode === "test" ? "test" : "live";
  const daysBack: number = Number.isFinite(body?.daysBack) ? body.daysBack : 180;
  const createdGte = Math.floor(Date.now() / 1000) - daysBack * 86400;

  const admin = createAdminClient();
  const stripe = await getStripeForMode(mode);

  interface Orphan {
    piId: string;
    status: string;
    amount: number;
    created: string;
    receiptEmail: string | null;
    metadata: Record<string, string>;
    latestCharge: string | null;
  }
  const orphans: Orphan[] = [];
  let scanned = 0;

  try {
    // Paginate succeeded PIs created within the window.
    let startingAfter: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const page: Stripe.ApiList<Stripe.PaymentIntent> =
        await stripe.paymentIntents.list({
          limit: 100,
          created: { gte: createdGte },
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });

      for (const pi of page.data) {
        scanned++;

        if (pi.status !== "succeeded") continue;
        const registrationId = pi.metadata?.registrationId;
        if (!registrationId) continue;

        const { data: reg } = await admin
          .from("eckcm_registrations")
          .select("id, status")
          .eq("id", registrationId)
          .maybeSingle();

        if (reg) continue; // Registration exists — not orphan.

        orphans.push({
          piId: pi.id,
          status: pi.status,
          amount: pi.amount,
          created: new Date(pi.created * 1000).toISOString(),
          receiptEmail: pi.receipt_email ?? null,
          metadata: (pi.metadata ?? {}) as Record<string, string>,
          latestCharge:
            typeof pi.latest_charge === "string" ? pi.latest_charge : null,
        });
      }

      hasMore = page.has_more;
      startingAfter = page.data[page.data.length - 1]?.id;
      if (!startingAfter) break;
    }
  } catch (err) {
    logger.error("[audit/orphan-payments] Stripe scan failed", {
      error: String(err),
    });
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Stripe scan failed",
        scanned,
        orphans,
      },
      { status: 500 }
    );
  }

  // Audit log (write-only record of who ran the audit and what they found).
  await admin.from("eckcm_audit_logs").insert({
    user_id: auth.user.id,
    action: "AUDIT_ORPHAN_PAYMENTS",
    entity_type: "system",
    entity_id: null,
    new_data: {
      mode,
      days_back: daysBack,
      scanned,
      orphan_count: orphans.length,
      total_orphan_amount_cents: orphans.reduce((s, o) => s + o.amount, 0),
    },
  });

  return NextResponse.json({
    mode,
    daysBack,
    scanned,
    orphanCount: orphans.length,
    totalOrphanAmountCents: orphans.reduce((s, o) => s + o.amount, 0),
    orphans,
  });
}
