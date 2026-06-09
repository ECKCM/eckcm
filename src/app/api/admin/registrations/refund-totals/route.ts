import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * GET /api/admin/registrations/refund-totals?eventId=...
 *
 * Aggregates the eckcm_refunds ledger for one event, scoped via the
 * registrations → invoices → payments → refunds chain (the same chain
 * hard-reset-event walks).
 *
 *   totalRefundedCents  = Σ amount_cents across ALL refund records — card
 *                         refunds plus manual/tracked-only refunds (Zelle /
 *                         Check / On-Site / cash) handled outside Stripe.
 *   stripeRefundedCents = Σ amount_cents WHERE stripe_refund_id IS NOT NULL —
 *                         money Stripe actually returned to the card. Each such
 *                         row stores the exact amount passed to
 *                         stripe.refunds.create(), so this mirrors Stripe.
 *
 * The gap between the two is refunds settled outside Stripe.
 */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const empty = { totalRefundedCents: 0, stripeRefundedCents: 0 };

  // event → registrations → invoices → payments → refunds
  const { data: regs } = await supabase
    .from("eckcm_registrations")
    .select("id")
    .eq("event_id", eventId);
  const regIds = (regs ?? []).map((r) => r.id);
  if (regIds.length === 0) return NextResponse.json(empty);

  const { data: invoices } = await supabase
    .from("eckcm_invoices")
    .select("id")
    .in("registration_id", regIds);
  const invoiceIds = (invoices ?? []).map((i) => i.id);
  if (invoiceIds.length === 0) return NextResponse.json(empty);

  const { data: payments } = await supabase
    .from("eckcm_payments")
    .select("id")
    .in("invoice_id", invoiceIds);
  const paymentIds = (payments ?? []).map((p) => p.id);
  if (paymentIds.length === 0) return NextResponse.json(empty);

  const { data: refunds } = await supabase
    .from("eckcm_refunds")
    .select("amount_cents, stripe_refund_id")
    .in("payment_id", paymentIds);

  let totalRefundedCents = 0;
  let stripeRefundedCents = 0;
  for (const r of refunds ?? []) {
    const cents = r.amount_cents ?? 0;
    totalRefundedCents += cents;
    if (r.stripe_refund_id) stripeRefundedCents += cents;
  }

  return NextResponse.json({ totalRefundedCents, stripeRefundedCents });
}
