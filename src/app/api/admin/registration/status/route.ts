import { after } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { generateEPassToken } from "@/lib/services/epass.service";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";
import { logger } from "@/lib/logger";
import { recalculateInventorySafe } from "@/lib/services/inventory.service";
import { syncRegistration } from "@/lib/services/google-sheets.service";

const VALID_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "PAID", "CANCELLED", "REFUNDED"];

// Allowed status transitions — prevents invalid state changes (e.g., CANCELLED -> PAID)
// APPROVED = $0 그룹의 최종 확인 상태 (결제 없이 확정). PAID와 동등한 터미널 상태.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "PAID", "CANCELLED"],
  APPROVED: ["CANCELLED"],              // $0 확정 — PAID 전이 불필요
  PAID: ["REFUNDED", "CANCELLED"],
  CANCELLED: ["DRAFT"],                 // 재오픈 허용
  REFUNDED: [],                         // 터미널 상태
};

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user, roles } = auth;

  const { registrationId, status } = await request.json();

  if (!registrationId || !status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Load current status to validate transition
  const { data: currentReg } = await admin
    .from("eckcm_registrations")
    .select("status")
    .eq("id", registrationId)
    .single();

  if (!currentReg) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  if (currentReg.status === status) {
    return NextResponse.json({ success: true }); // No-op, already in target status
  }

  // SUPER_ADMIN override: bypass transition rules for manual/no-payment registrations
  // Covers Zelle/Check/Manual payments AND $0 groups (APPROVED with no payment record)
  const isSuperAdmin = roles.includes("SUPER_ADMIN");
  let bypassTransitionRules = false;

  if (isSuperAdmin) {
    const MANUAL_METHODS = ["MANUAL", "CHECK", "ZELLE"];
    const { data: payment } = await admin
      .from("eckcm_payments")
      .select("payment_method, eckcm_invoices!inner(registration_id)")
      .eq("eckcm_invoices.registration_id", registrationId)
      .limit(1)
      .maybeSingle();

    // Bypass when: no payment exists ($0 group) OR payment is manual method
    bypassTransitionRules =
      !payment || MANUAL_METHODS.includes(payment.payment_method);
  }

  if (!bypassTransitionRules) {
    const allowed = ALLOWED_TRANSITIONS[currentReg.status] ?? [];
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { error: `Cannot change status from ${currentReg.status} to ${status}` },
        { status: 400 }
      );
    }
  }

  // Update registration status
  const { error: regError } = await admin
    .from("eckcm_registrations")
    .update({ status })
    .eq("id", registrationId);

  if (regError) {
    return NextResponse.json({ error: regError.message }, { status: 500 });
  }

  // When marking as APPROVED or PAID, activate e-pass and send confirmation
  if (status === "APPROVED" || status === "PAID") {
    // Update invoice & payment records (PAID only — APPROVED skips payment)
    if (status === "PAID") {
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

    // Send confirmation email (non-blocking — runs after response to avoid timeout)
    after(async () => {
      try {
        await sendConfirmationEmail(registrationId);
      } catch (err) {
        logger.error("[admin/registration/status] Failed to send confirmation email", { error: String(err) });
      }
    });
  }

  // When cancelling, delete all E-Pass tokens for this registration
  if (status === "CANCELLED") {
    const { error: epassError } = await admin
      .from("eckcm_epass_tokens")
      .delete()
      .eq("registration_id", registrationId);

    if (epassError) {
      logger.error("[admin/registration/status] Failed to delete epass tokens", { error: String(epassError) });
    }
  }

  // Audit log
  await admin.from("eckcm_audit_logs").insert({
    user_id: user.id,
    action: `ADMIN_STATUS_CHANGE_${status}`,
    entity_type: "registration",
    entity_id: registrationId,
  });

  // Update inventory counts
  await recalculateInventorySafe(admin);

  // Sync updated status to Google Sheets (non-blocking)
  const { data: regForSync } = await admin
    .from("eckcm_registrations")
    .select("event_id")
    .eq("id", registrationId)
    .single();
  if (regForSync) {
    syncRegistration(regForSync.event_id, registrationId).catch((err) =>
      logger.error("[admin/registration/status] Google Sheets sync failed", { error: String(err) })
    );
  }

  return NextResponse.json({ success: true });
}
