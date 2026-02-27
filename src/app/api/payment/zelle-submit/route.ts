import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEPassToken } from "@/lib/services/epass.service";
import { zelleSubmitSchema } from "@/lib/schemas/api";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = zelleSubmitSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { registrationId } = parsed.data;

  const admin = createAdminClient();

  // Load registration and verify ownership
  const { data: registration } = await admin
    .from("eckcm_registrations")
    .select("id, status, created_by_user_id, total_amount_cents, confirmation_code")
    .eq("id", registrationId)
    .single();

  if (!registration) {
    return NextResponse.json(
      { error: "Registration not found" },
      { status: 404 }
    );
  }

  if (registration.created_by_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (registration.status === "PAID") {
    return NextResponse.json(
      { error: "Registration already paid" },
      { status: 409 }
    );
  }

  // Load invoice
  const { data: invoice } = await admin
    .from("eckcm_invoices")
    .select("id, total_cents")
    .eq("registration_id", registrationId)
    .single();

  if (!invoice) {
    return NextResponse.json(
      { error: "Invoice not found" },
      { status: 404 }
    );
  }

  // Create ZELLE payment record
  await admin.from("eckcm_payments").insert({
    invoice_id: invoice.id,
    payment_method: "ZELLE",
    amount_cents: invoice.total_cents,
    status: "PENDING",
  });

  // Update registration status to SUBMITTED
  await admin
    .from("eckcm_registrations")
    .update({ status: "SUBMITTED" })
    .eq("id", registrationId);

  // Generate E-Pass tokens with is_active = false (activated when admin confirms payment)
  const { data: memberships } = await admin
    .from("eckcm_group_memberships")
    .select("person_id, eckcm_groups!inner(registration_id)")
    .eq("eckcm_groups.registration_id", registrationId);

  let tokensGenerated = 0;
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
          is_active: false,
        };
      });

    if (newTokens.length > 0) {
      const { error: insertError } = await admin
        .from("eckcm_epass_tokens")
        .insert(newTokens);
      if (insertError) {
        logger.error("[payment/zelle-submit] Failed to insert epass tokens", { error: String(insertError) });
      } else {
        tokensGenerated = newTokens.length;
      }
    }
  }
  logger.info("[payment/zelle-submit] Inactive E-Pass tokens generated", { tokensGenerated });

  // Audit log
  await admin.from("eckcm_audit_logs").insert({
    user_id: user.id,
    action: "ZELLE_PAYMENT_SUBMITTED",
    entity_type: "registration",
    entity_id: registrationId,
    new_data: {
      confirmation_code: registration.confirmation_code,
      amount_cents: invoice.total_cents,
      payment_method: "ZELLE",
      epass_tokens_generated: tokensGenerated,
    },
  });

  return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[payment/zelle-submit] Unhandled error", { error: String(err) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
