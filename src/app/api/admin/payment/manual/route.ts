import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEPassToken } from "@/lib/services/epass.service";
import { generateSafeConfirmationCode } from "@/lib/services/confirmation-code.service";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth/admin";

interface ManualPayBody {
  invoiceId: string;
  paymentMethod: string;
  note?: string;
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = auth;

  // 3. Parse body
  const body: ManualPayBody = await request.json();
  const { invoiceId, paymentMethod, note } = body;

  if (!invoiceId || !paymentMethod) {
    return NextResponse.json(
      { error: "Missing invoiceId or paymentMethod" },
      { status: 400 }
    );
  }

  const validMethods = ["MANUAL", "CHECK", "ZELLE", "ACH"];
  if (!validMethods.includes(paymentMethod)) {
    return NextResponse.json(
      { error: `Invalid payment method. Must be one of: ${validMethods.join(", ")}` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 4. Load invoice
  const { data: invoice } = await admin
    .from("eckcm_invoices")
    .select("id, registration_id, total_cents, status")
    .eq("id", invoiceId)
    .single();

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (invoice.status !== "PENDING") {
    return NextResponse.json(
      { error: `Invoice is already ${invoice.status}` },
      { status: 400 }
    );
  }

  // 5. Load registration
  const { data: registration } = await admin
    .from("eckcm_registrations")
    .select("id, event_id, confirmation_code")
    .eq("id", invoice.registration_id)
    .single();

  if (!registration) {
    return NextResponse.json(
      { error: "Registration not found" },
      { status: 404 }
    );
  }

  // 6. Insert payment record
  await admin.from("eckcm_payments").insert({
    invoice_id: invoice.id,
    payment_method: paymentMethod,
    amount_cents: invoice.total_cents,
    status: "SUCCEEDED",
    metadata: {
      recorded_by: user.id,
      note: note || null,
      manual: true,
    },
  });

  // 7. Update invoice status
  await admin
    .from("eckcm_invoices")
    .update({
      status: "SUCCEEDED",
      paid_at: new Date().toISOString(),
    })
    .eq("id", invoice.id);

  // 8. Update registration status
  await admin
    .from("eckcm_registrations")
    .update({ status: "PAID" })
    .eq("id", registration.id);

  // 9. Generate confirmation code if not already set
  if (!registration.confirmation_code) {
    let code = generateSafeConfirmationCode();
    let attempts = 0;
    while (attempts < 10) {
      const { data: existing } = await admin
        .from("eckcm_registrations")
        .select("id")
        .eq("event_id", registration.event_id)
        .eq("confirmation_code", code)
        .maybeSingle();

      if (!existing) break;
      code = generateSafeConfirmationCode();
      attempts++;
    }

    await admin
      .from("eckcm_registrations")
      .update({ confirmation_code: code })
      .eq("id", registration.id);
  }

  // 10. Generate E-Pass tokens
  const { data: memberships } = await admin
    .from("eckcm_group_memberships")
    .select("person_id, eckcm_groups!inner(registration_id)")
    .eq("eckcm_groups.registration_id", registration.id);

  if (memberships) {
    for (const membership of memberships) {
      const { data: existing } = await admin
        .from("eckcm_epass_tokens")
        .select("id")
        .eq("person_id", membership.person_id)
        .eq("registration_id", registration.id)
        .maybeSingle();

      if (!existing) {
        const { token, tokenHash } = generateEPassToken();
        await admin.from("eckcm_epass_tokens").insert({
          person_id: membership.person_id,
          registration_id: registration.id,
          token,
          token_hash: tokenHash,
          is_active: true,
        });
      }
    }
  }

  // 11. Send confirmation email (non-blocking)
  try {
    await sendConfirmationEmail(registration.id);
  } catch (err) {
    logger.error("[admin/payment/manual] Failed to send confirmation email", { error: String(err) });
  }

  // 12. Audit log
  await admin.from("eckcm_audit_logs").insert({
    event_id: registration.event_id,
    user_id: user.id,
    action: "ADMIN_MANUAL_PAYMENT",
    entity_type: "invoice",
    entity_id: invoice.id,
    new_data: {
      payment_method: paymentMethod,
      amount_cents: invoice.total_cents,
      note: note || null,
    },
  });

  return NextResponse.json({ success: true });
}
