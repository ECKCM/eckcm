import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { generateEPassToken } from "@/lib/services/epass.service";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";
import { logger } from "@/lib/logger";

const VALID_STATUSES = ["DRAFT", "SUBMITTED", "PAID", "CANCELLED", "REFUNDED"];

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = auth;

  const { registrationId, status } = await request.json();

  if (!registrationId || !status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Update registration status
  const { error: regError } = await admin
    .from("eckcm_registrations")
    .update({ status })
    .eq("id", registrationId);

  if (regError) {
    return NextResponse.json({ error: regError.message }, { status: 500 });
  }

  // When marking as PAID, cascade updates to payment, invoice, and e-pass
  if (status === "PAID") {
    // Update invoice
    const { data: invoice } = await admin
      .from("eckcm_invoices")
      .select("id, total_cents")
      .eq("registration_id", registrationId)
      .maybeSingle();

    if (invoice) {
      await admin
        .from("eckcm_invoices")
        .update({ status: "SUCCEEDED", paid_at: new Date().toISOString() })
        .eq("id", invoice.id);

      // Update existing PENDING payment or create one
      const { data: existingPayment } = await admin
        .from("eckcm_payments")
        .select("id")
        .eq("invoice_id", invoice.id)
        .eq("status", "PENDING")
        .maybeSingle();

      if (existingPayment) {
        await admin
          .from("eckcm_payments")
          .update({
            status: "SUCCEEDED",
            metadata: {
              confirmed_by_admin: true,
              recorded_by: user.id,
            },
          })
          .eq("id", existingPayment.id);
      } else {
        // Check if there's already a SUCCEEDED payment
        const { data: succeededPayment } = await admin
          .from("eckcm_payments")
          .select("id")
          .eq("invoice_id", invoice.id)
          .eq("status", "SUCCEEDED")
          .maybeSingle();

        if (!succeededPayment) {
          await admin.from("eckcm_payments").insert({
            invoice_id: invoice.id,
            payment_method: "MANUAL",
            amount_cents: invoice.total_cents,
            status: "SUCCEEDED",
            metadata: {
              recorded_by: user.id,
              confirmed_by_admin: true,
            },
          });
        }
      }
    }

    // Activate E-Pass tokens
    await admin
      .from("eckcm_epass_tokens")
      .update({ is_active: true })
      .eq("registration_id", registrationId)
      .eq("is_active", false);

    // Generate missing E-Pass tokens
    const { data: memberships } = await admin
      .from("eckcm_group_memberships")
      .select("person_id, eckcm_groups!inner(registration_id)")
      .eq("eckcm_groups.registration_id", registrationId);

    if (memberships && memberships.length > 0) {
      const personIds = memberships.map((m) => m.person_id);
      const { data: existingTokens } = await admin
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
        const { error: insertError } = await admin
          .from("eckcm_epass_tokens")
          .insert(newTokens);
        if (insertError) {
          logger.error("[admin/registration/status] Failed to insert epass tokens", { error: String(insertError) });
        }
      }
    }

    // Send confirmation email (non-blocking)
    try {
      await sendConfirmationEmail(registrationId);
    } catch (err) {
      logger.error("[admin/registration/status] Failed to send confirmation email", { error: String(err) });
    }
  }

  // Audit log
  await admin.from("eckcm_audit_logs").insert({
    user_id: user.id,
    action: `ADMIN_STATUS_CHANGE_${status}`,
    entity_type: "registration",
    entity_id: registrationId,
  });

  return NextResponse.json({ success: true });
}
