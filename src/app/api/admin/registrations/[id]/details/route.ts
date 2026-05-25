import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * PATCH /api/admin/registrations/[id]/details
 *
 * Edits top-level registration fields from the admin Overview tab.
 * Accepts any subset of: start_date, end_date, additional_requests,
 * registration_group_id. Recomputes nights_count when dates change.
 *
 * Does NOT recalculate fees — admins must use the Adjustments panel to
 * record any monetary delta from date/group changes.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};

  // Validate ISO date format (YYYY-MM-DD)
  const isIsoDate = (v: unknown): v is string =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

  if ("start_date" in body) {
    if (!isIsoDate(body.start_date)) {
      return NextResponse.json({ error: "Invalid start_date (YYYY-MM-DD)" }, { status: 400 });
    }
    updates.start_date = body.start_date;
  }
  if ("end_date" in body) {
    if (!isIsoDate(body.end_date)) {
      return NextResponse.json({ error: "Invalid end_date (YYYY-MM-DD)" }, { status: 400 });
    }
    updates.end_date = body.end_date;
  }
  if ("additional_requests" in body) {
    if (body.additional_requests != null && typeof body.additional_requests !== "string") {
      return NextResponse.json({ error: "additional_requests must be a string" }, { status: 400 });
    }
    const trimmed = typeof body.additional_requests === "string" ? body.additional_requests.trim() : null;
    updates.additional_requests = trimmed || null;
  }
  if ("registration_group_id" in body) {
    if (body.registration_group_id != null && typeof body.registration_group_id !== "string") {
      return NextResponse.json({ error: "registration_group_id must be a string" }, { status: 400 });
    }
    updates.registration_group_id = body.registration_group_id || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Load current row to derive end-date / nights and audit before+after.
  const { data: existing, error: fetchError } = await supabase
    .from("eckcm_registrations")
    .select("start_date, end_date, additional_requests, registration_group_id, nights_count, event_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  // Recompute nights when either date changes.
  const newStart = (updates.start_date as string | undefined) ?? existing.start_date;
  const newEnd = (updates.end_date as string | undefined) ?? existing.end_date;
  if ("start_date" in updates || "end_date" in updates) {
    if (new Date(newEnd) < new Date(newStart)) {
      return NextResponse.json({ error: "end_date must be on or after start_date" }, { status: 400 });
    }
    const ms = new Date(newEnd).getTime() - new Date(newStart).getTime();
    updates.nights_count = Math.max(0, Math.round(ms / 86_400_000));
  }

  // Validate that the new registration_group, if provided, belongs to the same event.
  if ("registration_group_id" in updates && updates.registration_group_id) {
    const { data: rg } = await supabase
      .from("eckcm_registration_groups")
      .select("id, event_id")
      .eq("id", updates.registration_group_id as string)
      .single();
    if (!rg || rg.event_id !== existing.event_id) {
      return NextResponse.json({ error: "Registration group does not belong to this event" }, { status: 400 });
    }
  }

  const { error: updateError } = await supabase
    .from("eckcm_registrations")
    .update(updates)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from("eckcm_audit_logs").insert({
    user_id: admin.user.id,
    action: "EDIT_REGISTRATION_DETAILS",
    entity_type: "registration",
    entity_id: id,
    old_data: existing,
    new_data: updates,
  });

  return NextResponse.json({ success: true, ...updates });
}
