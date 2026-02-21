import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { registrationId } = body;

  if (!registrationId) {
    return NextResponse.json(
      { error: "Missing registrationId" },
      { status: 400 }
    );
  }

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
    },
  });

  return NextResponse.json({ success: true });
}
