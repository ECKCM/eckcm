import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAuditLog } from "@/lib/services/audit.service";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";
import { generateEPassToken } from "@/lib/services/epass.service";
import { logger } from "@/lib/logger";

const MANUAL_METHODS = ["ZELLE", "CHECK", "MANUAL", "MANUAL_PAYMENT"];
const VALID_STATUSES = ["PENDING", "SUCCEEDED", "FAILED", "REFUNDED"];

/**
 * PATCH /api/admin/registrations/[id]/payment-status
 * Update payment status for manual payments (Zelle, Check, etc.).
 * Body: { status: "SUCCEEDED" | "PENDING" | "FAILED" | "REFUNDED" }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: registrationId } = await params;
  const { status } = await request.json();

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Get registration with its invoice and payment
  const { data: reg } = await supabase
    .from("eckcm_registrations")
    .select("id, event_id, status, eckcm_invoices(id, status, eckcm_payments(id, payment_method, status))")
    .eq("id", registrationId)
    .single();

  if (!reg) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = (reg as any).eckcm_invoices ?? [];
  const invoice = invoices[0];
  if (!invoice) {
    return NextResponse.json({ error: "No invoice found for this registration" }, { status: 404 });
  }

  const payments = invoice.eckcm_payments ?? [];
  const payment = payments[0];
  if (!payment) {
    return NextResponse.json({ error: "No payment found for this registration" }, { status: 404 });
  }

  // Only allow for manual payment methods
  const method = (payment.payment_method ?? "").toUpperCase();
  if (!MANUAL_METHODS.includes(method)) {
    return NextResponse.json(
      { error: "Payment status can only be changed for manual payments (Zelle, Check, etc.)" },
      { status: 400 }
    );
  }

  const previousStatus = payment.status;

  // Update payment status
  await supabase
    .from("eckcm_payments")
    .update({ status })
    .eq("id", payment.id);

  // Update invoice status to match
  await supabase
    .from("eckcm_invoices")
    .update({ status })
    .eq("id", invoice.id);

  // If marked as SUCCEEDED, update registration to PAID, activate E-Pass, and send email
  if (status === "SUCCEEDED" && reg.status !== "PAID" && reg.status !== "CANCELLED" && reg.status !== "REFUNDED") {
    await supabase
      .from("eckcm_registrations")
      .update({ status: "PAID" })
      .eq("id", registrationId);

    await supabase
      .from("eckcm_invoices")
      .update({ paid_at: new Date().toISOString() })
      .eq("id", invoice.id);

    // Activate E-Pass tokens
    await supabase
      .from("eckcm_epass_tokens")
      .update({ is_active: true })
      .eq("registration_id", registrationId)
      .eq("is_active", false);

    // Generate missing E-Pass tokens
    const { data: memberships } = await supabase
      .from("eckcm_group_memberships")
      .select("person_id, eckcm_groups!inner(registration_id)")
      .eq("eckcm_groups.registration_id", registrationId);

    if (memberships && memberships.length > 0) {
      const personIds = memberships.map((m) => m.person_id);
      const { data: existingTokens } = await supabase
        .from("eckcm_epass_tokens")
        .select("person_id")
        .eq("registration_id", registrationId)
        .in("person_id", personIds);

      const existingSet = new Set((existingTokens ?? []).map((t) => t.person_id));
      const newTokens = memberships
        .filter((m) => !existingSet.has(m.person_id))
        .map((m) => {
          const { token, tokenHash } = generateEPassToken();
          return {
            person_id: m.person_id,
            registration_id: registrationId,
            token,
            token_hash: tokenHash,
            is_active: true,
          };
        });

      if (newTokens.length > 0) {
        const { error: insertError } = await supabase
          .from("eckcm_epass_tokens")
          .insert(newTokens);
        if (insertError) {
          logger.error("[admin/payment-status] Failed to insert epass tokens", { error: String(insertError) });
        }
      }
    }

    // Send confirmation email (non-blocking)
    after(async () => {
      try {
        await sendConfirmationEmail(registrationId);
      } catch (err) {
        logger.error("[admin/payment-status] Failed to send confirmation email", { error: String(err) });
      }
    });
  }

  // Audit log
  await writeAuditLog(supabase, {
    event_id: reg.event_id,
    user_id: auth.user.id,
    action: "ADMIN_PAYMENT_STATUS_CHANGED",
    entity_type: "payment",
    entity_id: payment.id,
    new_data: {
      registration_id: registrationId,
      previous_status: previousStatus,
      new_status: status,
      payment_method: method,
    },
  });

  return NextResponse.json({ success: true, previous_status: previousStatus, new_status: status });
}
