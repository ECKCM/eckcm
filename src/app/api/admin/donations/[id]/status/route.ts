import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { sendDonationReceiptEmail } from "@/lib/email/send-donation-receipt";
import { logger } from "@/lib/logger";

const VALID_STATUSES = ["PENDING", "SUCCEEDED", "FAILED"] as const;
type DonationStatus = (typeof VALID_STATUSES)[number];

/**
 * PATCH /api/admin/donations/[id]/status
 * Admin marks a manual (Zelle/Check/Cash) donation as received, etc.
 * Body: { status: "SUCCEEDED" | "PENDING" | "FAILED" }
 *
 * On the transition into SUCCEEDED, the donor's tax receipt is emailed
 * (sendDonationReceiptEmail is itself idempotent/guarded).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { status } = (await request.json()) as { status?: string };

  if (!status || !VALID_STATUSES.includes(status as DonationStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: donation } = await admin
    .from("eckcm_donations")
    .select("id, status, donor_email, payment_method, metadata")
    .eq("id", id)
    .single();

  if (!donation) {
    return NextResponse.json({ error: "Donation not found" }, { status: 404 });
  }

  if (donation.status === status) {
    return NextResponse.json({ success: true, status, unchanged: true });
  }

  const wasSucceeded = donation.status === "SUCCEEDED";

  const { error: updateError } = await admin
    .from("eckcm_donations")
    .update({
      status,
      metadata: {
        ...((donation.metadata as Record<string, unknown> | null) ?? {}),
        confirmed_by: "admin",
        ...(status === "SUCCEEDED"
          ? { received_at: new Date().toISOString() }
          : {}),
      },
    })
    .eq("id", id);

  if (updateError) {
    logger.error("[admin/donations/status] Failed to update", {
      donationId: id,
      error: updateError.message,
    });
    return NextResponse.json({ error: "Failed to update donation" }, { status: 500 });
  }

  await admin.from("eckcm_audit_logs").insert({
    user_id: auth.user.id,
    action: "DONATION_STATUS_UPDATED",
    entity_type: "donation",
    entity_id: id,
    new_data: {
      status,
      previous_status: donation.status,
      payment_method: donation.payment_method,
    },
  });

  // Email the tax receipt on the transition into SUCCEEDED.
  if (status === "SUCCEEDED" && !wasSucceeded) {
    after(async () => {
      try {
        await sendDonationReceiptEmail(id);
      } catch (err) {
        logger.error("[admin/donations/status] Failed to send receipt", {
          donationId: id,
          error: String(err),
        });
      }
    });
  }

  return NextResponse.json({ success: true, status });
}
