import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

const METHOD_LABEL: Record<string, string> = {
  CARD: "Card",
  ONSITE_ZELLE: "Zelle",
  ONSITE_CASH: "Cash",
  ONSITE_CHECK: "Check",
};

// Map the request lifecycle to the underlying custom_payment status.
//   PENDING   → awaiting approval
//   SUCCEEDED → approved
//   FAILED    → voided
const STATUS_TO_PAYMENT: Record<string, string> = {
  SUBMITTED: "PENDING",
  APPROVED: "SUCCEEDED",
  VOID: "FAILED",
};

/**
 * GET /api/admin/meal-passes?status=SUBMITTED
 *
 * Lists on-site meal-pass REQUESTS (aggregate, multi-tier) for the admin to
 * confirm payment and approve. These are eckcm_custom_payments rows tagged
 * `metadata.kind = 'meal_pass_onsite_request'`. No QR is issued here — the desk
 * hands out pre-printed cards once approved. `status=ALL` returns every request.
 * Gated by requireAdmin(); the page itself is gated by `settings.manage`.
 */
export async function GET(req: NextRequest) {
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const statusParam = req.nextUrl.searchParams.get("status") || "SUBMITTED";
  const admin = createAdminClient();

  let query = admin
    .from("eckcm_custom_payments")
    .select(
      "id, payer_name, payer_email, amount_cents, payment_method, status, metadata, created_at"
    )
    .eq("metadata->>kind", "meal_pass_onsite_request")
    .order("created_at", { ascending: false })
    .limit(500);

  if (statusParam !== "ALL") {
    const paymentStatus = STATUS_TO_PAYMENT[statusParam];
    if (paymentStatus) query = query.eq("status", paymentStatus);
  }

  const { data, error } = await query;
  if (error) {
    logger.error("[admin/meal-passes] list failed", { error: error.message });
    return NextResponse.json({ error: "Failed to load requests" }, { status: 500 });
  }

  const requests = (data ?? []).map((p) => {
    const meta = (p.metadata as Record<string, unknown> | null) ?? {};
    const items = (meta.items as { tierCode: string; quantity: number }[] | undefined) ?? [];
    const requestStatus =
      p.status === "SUCCEEDED" ? "APPROVED" : p.status === "FAILED" ? "VOID" : "SUBMITTED";
    return {
      id: p.id,
      payerName: p.payer_name,
      payerEmail: p.payer_email,
      payerPhone: (meta.payer_phone as string | undefined) ?? null,
      churchName: (meta.church_name as string | undefined) ?? null,
      amountCents: p.amount_cents,
      method: METHOD_LABEL[p.payment_method as string] ?? p.payment_method,
      status: requestStatus,
      general: (meta.general as number) ?? 0,
      youth: (meta.youth as number) ?? 0,
      items,
      // Card-paid requests carry a Stripe charge → counts/amount are locked.
      locked: p.payment_method === "CARD",
      createdAt: p.created_at,
    };
  });

  return NextResponse.json({ requests });
}
