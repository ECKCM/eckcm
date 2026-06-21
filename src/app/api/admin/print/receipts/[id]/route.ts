import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeLineItems,
  sumLineItems,
  rowToManualReceipt,
  type ManualReceiptInput,
} from "@/lib/print/manual-receipt";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** GET /api/admin/print/receipts/[id] — fetch one saved receipt. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("eckcm_manual_receipts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }
  return NextResponse.json({ receipt: rowToManualReceipt(data) });
}

/**
 * PATCH /api/admin/print/receipts/[id] — update an existing saved receipt.
 * receipt_number and receipt_seq are never reassigned here; the document keeps
 * its identity. Only the editable fields change.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: ManualReceiptInput;
  try {
    body = (await req.json()) as ManualReceiptInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const lineItems = normalizeLineItems(body.lineItems);
  const amountCents =
    body.amountCents !== undefined && body.amountCents !== null
      ? Math.round(Number(body.amountCents) || 0)
      : sumLineItems(lineItems);

  const update: Record<string, unknown> = {
    event_id: body.eventId ?? null,
    registration_id: body.registrationId ?? null,
    recipient_name: body.recipientName ?? "",
    recipient_detail: body.recipientDetail ?? null,
    line_items: lineItems,
    amount_cents: amountCents,
    payment_method: body.paymentMethod ?? null,
    memo: body.memo ?? null,
    updated_at: new Date().toISOString(),
  };
  if (body.receiptDate) update.receipt_date = body.receiptDate;
  // Allow editing the receipt number, but guard the unique constraint.
  if (body.receiptNumber && body.receiptNumber.trim()) {
    update.receipt_number = body.receiptNumber.trim();
  }

  const { data, error } = await admin
    .from("eckcm_manual_receipts")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    const msg =
      error.code === "23505"
        ? `Receipt number "${body.receiptNumber?.trim()}" is already in use`
        : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }
  return NextResponse.json({ receipt: rowToManualReceipt(data) });
}

/** DELETE /api/admin/print/receipts/[id] — remove a saved receipt. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin
    .from("eckcm_manual_receipts")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
