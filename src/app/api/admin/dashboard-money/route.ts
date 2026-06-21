import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * GET /api/admin/dashboard-money?eventId=<id>
 *
 * Aggregates funding (per-registration allocations + manually-recorded amounts)
 * and donations totals for the dashboard money tiles. eventId is optional —
 * when set, funding allocations are filtered to that event, manual funding
 * keeps rows that target this event or are unscoped (event_id=null), and
 * donations are kept all-time (the donations table has no event_id column,
 * donations are typically attributed to the active camp meeting season).
 */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");

  const admin = createAdminClient();

  // ─── Funding allocations (registration-linked) ───────────────────
  // Only count active commitments (SUBMITTED/APPROVED/PAID) — mirrors the
  // Funding Tracker page. Allocations are inserted on submit and not cleaned
  // up on cancel/refund, so the status join is the safest filter.
  let allocQuery = admin
    .from("eckcm_funding_allocations")
    .select(`amount_cents, event_id, eckcm_registrations!inner(status)`)
    .in("eckcm_registrations.status", ["SUBMITTED", "APPROVED", "PAID"]);
  if (eventId) allocQuery = allocQuery.eq("event_id", eventId);
  const { data: allocations } = await allocQuery;
  const fundingAllocated = (allocations ?? []).reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sum: number, a: any) => sum + (a.amount_cents ?? 0),
    0
  );

  // ─── Manual funding entries ──────────────────────────────────────
  const { data: manualFunding } = await admin
    .from("eckcm_manual_funding")
    .select("amount_cents, event_id");
  const manualRows = (manualFunding ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (m: any) => !eventId || m.event_id === eventId || m.event_id === null
  );
  const manualFundingTotal = manualRows.reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sum: number, m: any) => sum + (m.amount_cents ?? 0),
    0
  );

  const fundingTotal = fundingAllocated + manualFundingTotal;

  // ─── Donations ───────────────────────────────────────────────────
  // Mirrors /admin/donations: drop abandoned CARD attempts (PENDING/FAILED),
  // since donors who opened the Stripe form but never paid are noise. Manual
  // methods stay from PENDING so admins can confirm receipt.
  const { data: donations } = await admin
    .from("eckcm_donations")
    .select("amount_cents, fee_cents, payment_method, status");

  let donationsGross = 0;
  let donationsNet = 0;
  let donationsPending = 0;
  let donationsReceivedCount = 0;
  let donationsPendingCount = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of (donations ?? []) as any[]) {
    if (
      d.payment_method === "CARD" &&
      (d.status === "PENDING" || d.status === "FAILED")
    ) {
      continue;
    }
    const total = (d.amount_cents ?? 0) + (d.fee_cents ?? 0);
    const isCard = d.payment_method === "CARD";
    // Stripe 2.9% + 30¢ estimate — matches the Donations table card.
    const fee = isCard ? Math.round(total * 0.029) + 30 : 0;
    if (d.status === "SUCCEEDED") {
      donationsGross += total;
      donationsNet += total - fee;
      donationsReceivedCount += 1;
    } else if (d.status === "PENDING") {
      donationsPending += total;
      donationsPendingCount += 1;
    }
  }

  return NextResponse.json({
    funding: {
      allocatedCents: fundingAllocated,
      manualCents: manualFundingTotal,
      totalCents: fundingTotal,
    },
    donations: {
      grossCents: donationsGross,
      netCents: donationsNet,
      pendingCents: donationsPending,
      receivedCount: donationsReceivedCount,
      pendingCount: donationsPendingCount,
    },
  });
}
