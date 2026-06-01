import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { logger } from "@/lib/logger";

/**
 * DELETE /api/admin/donations/[id]
 * Deletes a MANUAL (Zelle/Check/Cash) donation record — these may never have
 * actually been paid, so removing noise is fine. CARD donations can never be
 * deleted (they represent a real Stripe charge — refund instead).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: donation } = await admin
    .from("eckcm_donations")
    .select("id, payment_method, status, amount_cents, donor_name, metadata")
    .eq("id", id)
    .single();

  if (!donation) {
    return NextResponse.json({ error: "Donation not found" }, { status: 404 });
  }

  if (donation.payment_method === "CARD") {
    return NextResponse.json(
      { error: "Card donations cannot be deleted. Use Refund instead." },
      { status: 400 }
    );
  }

  const { error: delError } = await admin
    .from("eckcm_donations")
    .delete()
    .eq("id", id);

  if (delError) {
    logger.error("[admin/donations] Delete failed", { donationId: id, error: delError.message });
    return NextResponse.json({ error: "Failed to delete donation" }, { status: 500 });
  }

  await admin.from("eckcm_audit_logs").insert({
    user_id: auth.user.id,
    action: "DONATION_DELETED",
    entity_type: "donation",
    entity_id: id,
    new_data: {
      amount_cents: donation.amount_cents,
      payment_method: donation.payment_method,
      status: donation.status,
      donor_name: donation.donor_name,
    },
  });

  return NextResponse.json({ success: true });
}
