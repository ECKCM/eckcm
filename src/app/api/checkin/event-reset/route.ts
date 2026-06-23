import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCheckinStaff } from "@/lib/auth/admin";

/**
 * POST /api/checkin/event-reset — clear EVERY recorded meal check-in for an
 * event (all dates, all meals) so the whole event's meal counts restart from
 * zero in one action.
 *
 * Body: { eventId }
 *
 * Scope: deletes the DINING check-ins (BOTH real and sandbox/simulation) for the
 * event. Main-desk (MAIN) check-ins, registrations, payments, people and
 * e-passes are never touched — this is the meal-kiosk-wide companion to the
 * single-meal /api/checkin/meal-reset, NOT the event-wide
 * /api/admin/hard-reset-event nuke.
 *
 * Any check-in operator may run it (SUPER_ADMIN / EVENT_ADMIN / UPJ_STAFF); the
 * UI gates it behind a typed confirmation and the deletion is always written to
 * the audit log with the actor + deleted count.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCheckinStaff();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = auth;

  const body = (await req.json().catch(() => ({}))) as { eventId?: string };
  const { eventId } = body;

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: deleted, error } = await admin
    .from("eckcm_checkins")
    .delete()
    .eq("event_id", eventId)
    .eq("checkin_type", "DINING")
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
    action: "EVENT_MEAL_CHECKIN_RESET",
    entity_type: "checkin",
    entity_id: eventId,
    new_data: { scope: "event_dining", deleted: deletedCount },
  });
  if (auditError) {
    console.error("[event-reset] audit log failed", auditError.message);
  }

  return NextResponse.json({ success: true, deleted: deletedCount });
}
