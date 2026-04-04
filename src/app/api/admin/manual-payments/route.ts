import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eckcm_manual_payments")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ payments: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = auth;

  const body = await request.json();
  const { payment_type, registration_code, first_name, last_name, amount_cents, date_received, note } = body;

  if (!payment_type || !first_name || !last_name || !amount_cents || !date_received) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!["zelle", "check"].includes(payment_type)) {
    return NextResponse.json({ error: "Invalid payment type" }, { status: 400 });
  }

  if (typeof amount_cents !== "number" || amount_cents <= 0) {
    return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("eckcm_manual_payments")
    .insert({
      payment_type,
      registration_code: registration_code || null,
      first_name,
      last_name,
      amount_cents,
      date_received,
      note: note || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit log
  await admin.from("eckcm_audit_logs").insert({
    user_id: user.id,
    action: "MANUAL_PAYMENT_CREATE",
    entity_type: "manual_payment",
    entity_id: data.id,
    new_data: { payment_type, registration_code, first_name, last_name, amount_cents },
  });

  return NextResponse.json({ payment: data });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = auth;

  const body = await request.json();
  const { id, status, registration_code, first_name, last_name, amount_cents, date_received, note, refund_amount_cents } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  if (status && !["received", "updated", "refunded", "partially_refunded"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  if (amount_cents !== undefined && (typeof amount_cents !== "number" || amount_cents <= 0)) {
    return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get old record for audit
  const { data: old } = await admin
    .from("eckcm_manual_payments")
    .select("*")
    .eq("id", id)
    .single();

  if (!old) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  // Handle partial/full refund
  if (refund_amount_cents !== undefined) {
    if (typeof refund_amount_cents !== "number" || refund_amount_cents <= 0) {
      return NextResponse.json({ error: "Refund amount must be positive" }, { status: 400 });
    }

    const alreadyRefunded = old.refunded_cents ?? 0;
    const remaining = old.amount_cents - alreadyRefunded;

    if (refund_amount_cents > remaining) {
      return NextResponse.json(
        { error: `Refund amount ($${(refund_amount_cents / 100).toFixed(2)}) exceeds remaining balance ($${(remaining / 100).toFixed(2)})` },
        { status: 400 }
      );
    }

    const newRefundedTotal = alreadyRefunded + refund_amount_cents;
    updatePayload.refunded_cents = newRefundedTotal;
    updatePayload.status = newRefundedTotal >= old.amount_cents ? "refunded" : "partially_refunded";
  } else {
    if (status !== undefined) updatePayload.status = status;
  }

  if (registration_code !== undefined) updatePayload.registration_code = registration_code;
  if (first_name !== undefined) updatePayload.first_name = first_name;
  if (last_name !== undefined) updatePayload.last_name = last_name;
  if (amount_cents !== undefined) updatePayload.amount_cents = amount_cents;
  if (date_received !== undefined) updatePayload.date_received = date_received;
  if (note !== undefined) updatePayload.note = note;

  const { data, error } = await admin
    .from("eckcm_manual_payments")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const action = refund_amount_cents !== undefined
    ? "MANUAL_PAYMENT_REFUND"
    : status === "refunded"
      ? "MANUAL_PAYMENT_REFUND"
      : status
        ? "MANUAL_PAYMENT_STATUS"
        : "MANUAL_PAYMENT_EDIT";

  await admin.from("eckcm_audit_logs").insert({
    user_id: user.id,
    action,
    entity_type: "manual_payment",
    entity_id: id,
    old_data: old,
    new_data: updatePayload,
  });

  return NextResponse.json({ payment: data });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = auth;

  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: old } = await admin
    .from("eckcm_manual_payments")
    .select("*")
    .eq("id", id)
    .single();

  if (!old) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const { error } = await admin
    .from("eckcm_manual_payments")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("eckcm_audit_logs").insert({
    user_id: user.id,
    action: "MANUAL_PAYMENT_DELETE",
    entity_type: "manual_payment",
    entity_id: id,
    old_data: old,
  });

  return NextResponse.json({ success: true });
}
