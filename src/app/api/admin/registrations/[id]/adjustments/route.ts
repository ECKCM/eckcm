import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAuditLog } from "@/lib/services/audit.service";
import {
  getAdjustmentsWithSummary,
  createAdjustment,
} from "@/lib/services/adjustment.service";
import type { AdjustmentType, AdjustmentAction } from "@/lib/types/database";

const VALID_TYPES: AdjustmentType[] = [
  "date_change",
  "option_change",
  "discount",
  "cancellation",
  "admin_correction",
];
const VALID_ACTIONS: AdjustmentAction[] = [
  "charge",
  "refund",
  "credit",
  "waive",
  "pending",
];

// ─── GET: List adjustments with summary ───
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: registrationId } = await params;
  const admin = createAdminClient();

  const result = await getAdjustmentsWithSummary(admin, registrationId);
  return NextResponse.json(result);
}

// ─── POST: Create new adjustment ───
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { user } = auth;
  const { id: registrationId } = await params;

  let body: {
    adjustment_type: AdjustmentType;
    new_amount: number;
    action_taken: AdjustmentAction;
    reason: string;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { adjustment_type, new_amount, action_taken, reason, metadata } = body;

  // Validation
  if (!VALID_TYPES.includes(adjustment_type)) {
    return NextResponse.json(
      {
        error: `Invalid adjustment_type. Must be one of: ${VALID_TYPES.join(", ")}`,
      },
      { status: 400 }
    );
  }
  if (!VALID_ACTIONS.includes(action_taken)) {
    return NextResponse.json(
      {
        error: `Invalid action_taken. Must be one of: ${VALID_ACTIONS.join(", ")}`,
      },
      { status: 400 }
    );
  }
  if (
    typeof new_amount !== "number" ||
    !Number.isInteger(new_amount) ||
    new_amount < 0
  ) {
    return NextResponse.json(
      { error: "new_amount must be a non-negative integer (cents)" },
      { status: 400 }
    );
  }
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return NextResponse.json(
      { error: "reason is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify registration exists
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("id, event_id")
    .eq("id", registrationId)
    .single();

  if (!reg) {
    return NextResponse.json(
      { error: "Registration not found" },
      { status: 404 }
    );
  }

  try {
    const adjustment = await createAdjustment(admin, {
      registrationId,
      adjustmentType: adjustment_type,
      newAmount: new_amount,
      actionTaken: action_taken,
      reason: reason.trim(),
      adjustedBy: user.id,
      metadata: metadata ?? {},
    });

    // Audit log
    await writeAuditLog(admin, {
      event_id: reg.event_id,
      user_id: user.id,
      action: "ADMIN_ADJUSTMENT_CREATED",
      entity_type: "registration",
      entity_id: registrationId,
      new_data: {
        adjustment_id: adjustment.id,
        adjustment_type,
        previous_amount: adjustment.previous_amount,
        new_amount: adjustment.new_amount,
        difference: adjustment.difference,
        action_taken,
        reason: reason.trim(),
      },
    });

    return NextResponse.json({ adjustment, success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create adjustment" },
      { status: 500 }
    );
  }
}
