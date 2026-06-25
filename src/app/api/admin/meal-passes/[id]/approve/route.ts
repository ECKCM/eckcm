import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/audit.service";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/meal-passes/{id}/approve
 *
 * Approves an on-site meal-pass REQUEST (an eckcm_custom_payments row tagged
 * `meal_pass_onsite_request`): PENDING → SUCCEEDED, confirming the admin received
 * the Zelle/Cash/Check payment. No QR is issued — the desk hands out pre-printed
 * cards. Only acts on PENDING requests. Gated by requireAdmin().
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
  if (payment.status === "SUCCEEDED") {
    return NextResponse.json({ status: "already_approved" });
  }
  if (payment.status !== "PENDING") {
    return NextResponse.json(
      { error: `Cannot approve a ${String(payment.status).toLowerCase()} request` },
      { status: 409 }
    );
  }

  const meta = (payment.metadata as Record<string, unknown> | null) ?? {};
  const { error: upErr } = await admin
    .from("eckcm_custom_payments")
    .update({
      status: "SUCCEEDED",
      metadata: {
        ...meta,
        confirmed_by: "admin",
        approved_by_user_id: adminAuth.user.id,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "PENDING");

  if (upErr) {
    logger.error("[admin/meal-passes/approve] failed", { id, error: upErr.message });
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }

  await writeAuditLog(admin, {
    event_id: (meta.event_id as string | null) ?? null,
    user_id: adminAuth.user.id,
    action: "MEAL_PASS_REQUEST_APPROVED",
    entity_type: "meal_pass_request",
    entity_id: id,
    new_data: { general: meta.general ?? 0, youth: meta.youth ?? 0 },
  });

  return NextResponse.json({ status: "approved" });
}
