import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAuditLog } from "@/lib/services/audit.service";
import { updateAdjustment } from "@/lib/services/adjustment.service";
import { updateCustomChargeLineItem } from "@/lib/services/invoice.service";
import type { AdjustmentType } from "@/lib/types/database";

// Types an admin may assign when editing (mirrors the create route; excludes the
// system-generated `initial_payment`).
const VALID_TYPES: AdjustmentType[] = [
  "date_change",
  "option_change",
  "discount",
  "cancellation",
  "admin_correction",
];

// ─── PATCH: Edit an adjustment's reason (and optionally its type) ───
// Amount/action are NOT editable here — the ledger and any issued invoice/refund
// must stay consistent. For a custom-charge adjustment, the linked invoice line
// item is updated too so the invoice/receipt PDF reflects the new reason.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; adjustmentId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { user } = auth;
  const { id: registrationId, adjustmentId } = await params;

  let body: { reason?: string; adjustment_type?: AdjustmentType };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }
  if (
    body.adjustment_type !== undefined &&
    !VALID_TYPES.includes(body.adjustment_type)
  ) {
    return NextResponse.json(
      { error: `Invalid adjustment_type. Must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Load the adjustment, scoped to this registration (ownership check).
  const { data: existing } = await admin
    .from("eckcm_registration_adjustments")
    .select("id, registration_id, adjustment_type, reason, metadata")
    .eq("id", adjustmentId)
    .eq("registration_id", registrationId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Adjustment not found" }, { status: 404 });
  }

  // The system-generated initial payment keeps its type; only its reason can change.
  const newType =
    existing.adjustment_type === "initial_payment"
      ? undefined
      : body.adjustment_type;

  const updated = await updateAdjustment(admin, adjustmentId, {
    reason,
    adjustmentType: newType,
  });
  if (!updated) {
    return NextResponse.json(
      { error: "Failed to update adjustment" },
      { status: 500 }
    );
  }

  // Keep the custom-charge invoice/receipt document in sync with the new reason.
  const meta = (existing.metadata ?? {}) as {
    custom_charge_invoice_id?: string;
    custom_charge_line_item_id?: string;
  };
  if (meta.custom_charge_line_item_id || meta.custom_charge_invoice_id) {
    try {
      await updateCustomChargeLineItem(
        admin,
        {
          lineItemId: meta.custom_charge_line_item_id ?? null,
          invoiceId: meta.custom_charge_invoice_id ?? null,
        },
        reason
      );
    } catch {
      // Non-fatal: the adjustment edit succeeded; the document text just stays stale.
    }
  }

  // Audit log (needs the registration's event for scoping).
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("event_id")
    .eq("id", registrationId)
    .single();

  await writeAuditLog(admin, {
    event_id: reg?.event_id ?? null,
    user_id: user.id,
    action: "ADMIN_ADJUSTMENT_EDITED",
    entity_type: "registration",
    entity_id: registrationId,
    new_data: {
      adjustment_id: adjustmentId,
      previous_reason: existing.reason,
      new_reason: reason,
      previous_type: existing.adjustment_type,
      new_type: updated.adjustment_type,
    },
  });

  return NextResponse.json({ adjustment: updated, success: true });
}
