import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeLineItems,
  sumLineItems,
  rowToManualReceipt,
  nextReceiptNumber,
  type ManualReceiptInput,
} from "@/lib/print/manual-receipt";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/admin/print/receipts?eventId=xxx
 * List saved manual receipts (most recent first), optionally scoped to an event.
 */
export async function GET(req: NextRequest) {
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = req.nextUrl.searchParams.get("eventId");
  const admin = createAdminClient();

  let query = admin
    .from("eckcm_manual_receipts")
    .select("*")
    .order("created_at", { ascending: false });

  if (eventId && eventId !== "ALL") {
    query = query.eq("event_id", eventId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    receipts: (data ?? []).map((r) => rowToManualReceipt(r)),
  });
}

/**
 * POST /api/admin/print/receipts
 * Create (save) one manual receipt. A receipt is saved the moment it's created,
 * per the feature requirement. Receipt number is auto-assigned (MR-YYYY-NNNN)
 * unless the admin supplied an explicit one.
 */
export async function POST(req: NextRequest) {
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // Receipt year: prefer the receipt_date's year, fall back to current US/Eastern year.
  const receiptDate =
    body.receiptDate ||
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD
  const year = parseInt(receiptDate.slice(0, 4), 10) || new Date().getFullYear();

  const baseRow = {
    event_id: body.eventId ?? null,
    registration_id: body.registrationId ?? null,
    recipient_name: body.recipientName ?? "",
    recipient_detail: body.recipientDetail ?? null,
    receipt_date: receiptDate,
    line_items: lineItems,
    amount_cents: amountCents,
    payment_method: body.paymentMethod ?? null,
    memo: body.memo ?? null,
    created_by: adminAuth.user.id,
  };

  // If the admin set an explicit number, honor it; otherwise auto-assign and
  // retry on the unique-constraint race (two admins creating at once).
  if (body.receiptNumber && body.receiptNumber.trim()) {
    const { data, error } = await admin
      .from("eckcm_manual_receipts")
      .insert({
        ...baseRow,
        receipt_number: body.receiptNumber.trim(),
        receipt_seq: 0,
      })
      .select("*")
      .single();
    if (error) {
      const msg =
        error.code === "23505"
          ? `Receipt number "${body.receiptNumber.trim()}" is already in use`
          : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ receipt: rowToManualReceipt(data) });
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const { seq, receiptNumber } = await nextReceiptNumber(admin, year);
    const { data, error } = await admin
      .from("eckcm_manual_receipts")
      .insert({ ...baseRow, receipt_number: receiptNumber, receipt_seq: seq })
      .select("*")
      .single();

    if (!error) {
      return NextResponse.json({ receipt: rowToManualReceipt(data) });
    }
    if (error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // 23505 → another receipt grabbed this number; loop and bump the seq.
  }

  return NextResponse.json(
    { error: "Could not assign a unique receipt number, please retry" },
    { status: 409 }
  );
}
