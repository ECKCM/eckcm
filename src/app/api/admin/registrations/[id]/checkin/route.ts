import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAuditLog } from "@/lib/services/audit.service";
import { logger } from "@/lib/logger";

const VALID_ACTIONS = ["check_in", "uncheck_in", "check_out", "uncheck_out"] as const;
type CheckinAction = (typeof VALID_ACTIONS)[number];

/**
 * POST /api/admin/registrations/[id]/checkin
 *
 * Registration-level manual check-in / check-out for admins. Check-ins live in
 * `eckcm_checkins` per-person (checkin_type='MAIN'); a registration counts as
 * checked-in/out when ANY of its participants is. These actions therefore
 * operate on ALL of the registration's current participants at once:
 *
 *   - check_in    → ensure every participant has a MAIN check-in row
 *   - uncheck_in  → delete every participant's MAIN row (also clears check-out)
 *   - check_out   → check everyone in (if needed), then stamp checked_out_at
 *   - uncheck_out → clear checked_out_at, leaving everyone checked in
 *
 * Body: { action: "check_in" | "uncheck_in" | "check_out" | "uncheck_out" }
 *
 * Only real (is_sandbox=false) MAIN rows are touched — test-scan rows are left
 * untouched.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: registrationId } = await params;
  const { action } = (await request.json()) as { action?: CheckinAction };

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Registration → event scope
  const { data: reg } = await supabase
    .from("eckcm_registrations")
    .select("id, event_id, confirmation_code")
    .eq("id", registrationId)
    .single();

  if (!reg) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }
  const eventId = reg.event_id;

  // Every current participant of this registration.
  const { data: memberships } = await supabase
    .from("eckcm_group_memberships")
    .select("person_id, eckcm_groups!inner(registration_id)")
    .eq("eckcm_groups.registration_id", registrationId);

  const personIds = Array.from(
    new Set((memberships ?? []).map((m) => m.person_id).filter(Boolean))
  );

  if (personIds.length === 0) {
    return NextResponse.json(
      { error: "This registration has no participants to check in." },
      { status: 400 }
    );
  }

  // Existing real MAIN check-in rows for these participants.
  const { data: existing } = await supabase
    .from("eckcm_checkins")
    .select("id, person_id, checked_out_at")
    .eq("event_id", eventId)
    .eq("checkin_type", "MAIN")
    .eq("is_sandbox", false)
    .in("person_id", personIds);

  const checkedInPersonIds = new Set((existing ?? []).map((c) => c.person_id));
  const now = new Date().toISOString();
  let affected = 0;

  const insertMissing = async (alsoCheckOut: boolean) => {
    const missing = personIds.filter((pid) => !checkedInPersonIds.has(pid));
    if (missing.length === 0) return;
    const rows = missing.map((pid) => ({
      person_id: pid,
      event_id: eventId,
      checkin_type: "MAIN",
      checked_in_by: auth.user.id,
      is_sandbox: false,
      ...(alsoCheckOut
        ? { checked_out_at: now, checked_out_by: auth.user.id }
        : {}),
    }));
    const { error } = await supabase.from("eckcm_checkins").insert(rows);
    if (error) throw error;
    affected += rows.length;
  };

  try {
    if (action === "check_in") {
      await insertMissing(false);
    } else if (action === "uncheck_in") {
      const { error, count } = await supabase
        .from("eckcm_checkins")
        .delete({ count: "exact" })
        .eq("event_id", eventId)
        .eq("checkin_type", "MAIN")
        .eq("is_sandbox", false)
        .in("person_id", personIds);
      if (error) throw error;
      affected = count ?? 0;
    } else if (action === "check_out") {
      // Anyone not yet checked in is created already checked-out; the rest are
      // stamped below.
      await insertMissing(true);
      const { error, count } = await supabase
        .from("eckcm_checkins")
        .update(
          { checked_out_at: now, checked_out_by: auth.user.id },
          { count: "exact" }
        )
        .eq("event_id", eventId)
        .eq("checkin_type", "MAIN")
        .eq("is_sandbox", false)
        .in("person_id", personIds)
        .is("checked_out_at", null);
      if (error) throw error;
      affected += count ?? 0;
    } else if (action === "uncheck_out") {
      const { error, count } = await supabase
        .from("eckcm_checkins")
        .update(
          { checked_out_at: null, checked_out_by: null },
          { count: "exact" }
        )
        .eq("event_id", eventId)
        .eq("checkin_type", "MAIN")
        .eq("is_sandbox", false)
        .in("person_id", personIds);
      if (error) throw error;
      affected = count ?? 0;
    }
  } catch (err) {
    logger.error("[admin/checkin] Failed to apply check-in action", {
      registrationId,
      action,
      error: String(err),
    });
    return NextResponse.json(
      { error: "Failed to update check-in status" },
      { status: 500 }
    );
  }

  await writeAuditLog(supabase, {
    event_id: eventId,
    user_id: auth.user.id,
    action: "ADMIN_CHECKIN_CHANGED",
    entity_type: "registration",
    entity_id: registrationId,
    new_data: {
      confirmation_code: reg.confirmation_code,
      checkin_action: action,
      participants: personIds.length,
      affected,
    },
  });

  return NextResponse.json({ success: true, action, affected });
}
