import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCheckinStaff } from "@/lib/auth/admin";

const MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER"] as const;

/**
 * POST /api/checkin/meal-reset — clear the recorded check-ins for one meal slot
 * so a live kiosk session can restart its count from zero.
 *
 * Body: { eventId, mealDate (YYYY-MM-DD), mealType (BREAKFAST|LUNCH|DINNER) }
 *
 * Scope is deliberately narrow: it deletes ONLY the real (non-sandbox) DINING
 * check-ins for that exact (event, meal date, meal type). Registrations,
 * payments, people, e-passes and every other meal slot are untouched — this is
 * a "reset this meal's attendance", not the event-wide hard reset under
 * /api/admin/hard-reset-event.
 *
 * Any check-in operator may run it (SUPER_ADMIN / EVENT_ADMIN / UPJ_STAFF); the
 * deletion is always written to the audit log with the actor + deleted count.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCheckinStaff();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = auth;

  const body = (await req.json().catch(() => ({}))) as {
    eventId?: string;
    mealDate?: string;
    mealType?: string;
  };
  const { eventId, mealDate, mealType } = body;

  if (!eventId || !mealDate || !mealType) {
    return NextResponse.json(
      { error: "eventId, mealDate, and mealType are required" },
      { status: 400 }
    );
  }
  if (!MEAL_TYPES.includes(mealType as (typeof MEAL_TYPES)[number])) {
    return NextResponse.json(
      { error: "mealType must be BREAKFAST, LUNCH, or DINNER" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: deleted, error } = await admin
    .from("eckcm_checkins")
    .delete()
    .eq("event_id", eventId)
    .eq("checkin_type", "DINING")
    .eq("meal_date", mealDate)
    .eq("meal_type", mealType)
    .eq("is_sandbox", false)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const deletedCount = deleted?.length ?? 0;

  // Audit trail for the destructive action — awaited so it persists before we
  // respond, but a logging hiccup never fails the reset itself.
  const { error: auditError } = await admin.from("eckcm_audit_logs").insert({
    event_id: eventId,
    user_id: user.id,
    action: "MEAL_CHECKIN_RESET",
    entity_type: "checkin",
    entity_id: eventId,
    new_data: { mealDate, mealType, deleted: deletedCount },
  });
  if (auditError) {
    console.error("[meal-reset] audit log failed", auditError.message);
  }

  return NextResponse.json({ success: true, deleted: deletedCount });
}
