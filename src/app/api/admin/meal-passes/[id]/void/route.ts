import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/audit.service";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/meal-passes/{id}/void
 *
 * Voids an on-site meal-pass REQUEST (eckcm_custom_payments tagged
 * `meal_pass_onsite_request`): sets the payment FAILED so it leaves the queue.
 * Used to reject a request that won't be paid. Already-voided requests are a
 * no-op. Gated by requireAdmin().
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: payment } = await admin
    .from("eckcm_custom_payments")
    .select("id, status, metadata")
    .eq("id", id)
    .eq("metadata->>kind", "meal_pass_onsite_request")
    .maybeSingle();

  if (!payment) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (payment.status === "FAILED") {
    return NextResponse.json({ status: "already_void" });
  }

  const meta = (payment.metadata as Record<string, unknown> | null) ?? {};
  const { error: upErr } = await admin
    .from("eckcm_custom_payments")
    .update({
      status: "FAILED",
      metadata: { ...meta, voided_by_user_id: adminAuth.user.id },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (upErr) {
    logger.error("[admin/meal-passes/void] failed", { id, error: upErr.message });
    return NextResponse.json({ error: "Failed to void" }, { status: 500 });
  }

  await writeAuditLog(admin, {
    event_id: (meta.event_id as string | null) ?? null,
    user_id: adminAuth.user.id,
    action: "MEAL_PASS_REQUEST_VOIDED",
    entity_type: "meal_pass_request",
    entity_id: id,
    old_data: { previous_status: payment.status },
  });

  return NextResponse.json({ status: "voided" });
}
