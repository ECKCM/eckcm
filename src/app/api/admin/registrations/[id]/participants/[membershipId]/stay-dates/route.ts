import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * PATCH /api/admin/registrations/[id]/participants/[membershipId]/stay-dates
 *
 * Sets per-participant stay date overrides. Both dates must be sent together
 * (matching the DB CHECK constraint). Send both as null to clear the override
 * and fall back to the registration's default dates.
 *
 * Does NOT recalculate fees — admins should record any monetary delta in
 * the Adjustments tab.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; membershipId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: registrationId, membershipId } = await params;
  const body = await request.json();

  const start = body.stay_start_date as string | null | undefined;
  const end = body.stay_end_date as string | null | undefined;

  const isIso = (v: unknown): v is string =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

  // Pair must be (null, null) or (date, date)
  let payload: { stay_start_date: string | null; stay_end_date: string | null };
  if (start == null && end == null) {
    payload = { stay_start_date: null, stay_end_date: null };
  } else if (isIso(start) && isIso(end)) {
    if (new Date(end) < new Date(start)) {
      return NextResponse.json({ error: "stay_end_date must be on or after stay_start_date" }, { status: 400 });
    }
    payload = { stay_start_date: start, stay_end_date: end };
  } else {
    return NextResponse.json({ error: "Both dates required (YYYY-MM-DD) or both null" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify membership belongs to a group that belongs to this registration.
  const { data: membership } = await supabase
    .from("eckcm_group_memberships")
    .select(`id, stay_start_date, stay_end_date, eckcm_groups!inner(registration_id)`)
    .eq("id", membershipId)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = membership as any;
  if (!m || m.eckcm_groups?.registration_id !== registrationId) {
    return NextResponse.json({ error: "Membership not found in this registration" }, { status: 404 });
  }

  // Optional: clamp to within the registration's overall window. Just warn,
  // don't reject — admins sometimes need to record an out-of-window stay.

  const { error } = await supabase
    .from("eckcm_group_memberships")
    .update(payload)
    .eq("id", membershipId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("eckcm_audit_logs").insert({
    user_id: admin.user.id,
    action: "EDIT_PARTICIPANT_STAY_DATES",
    entity_type: "membership",
    entity_id: membershipId,
    old_data: { stay_start_date: m.stay_start_date, stay_end_date: m.stay_end_date },
    new_data: { registration_id: registrationId, ...payload },
  });

  return NextResponse.json({ success: true, ...payload });
}
