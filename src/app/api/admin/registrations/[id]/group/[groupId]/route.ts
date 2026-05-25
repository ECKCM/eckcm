import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * PATCH /api/admin/registrations/[id]/group/[groupId]
 *
 * Edits per-group fields from the admin Overview tab.
 * Currently supports: preferences (room prefs JSON), key_count.
 * Lodging type and room assignment continue to use their dedicated endpoints.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: registrationId, groupId } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};

  if ("preferences" in body) {
    const p = body.preferences;
    if (
      !p ||
      typeof p !== "object" ||
      typeof p.elderly !== "boolean" ||
      typeof p.handicapped !== "boolean" ||
      typeof p.firstFloor !== "boolean"
    ) {
      return NextResponse.json(
        { error: "preferences must be { elderly, handicapped, firstFloor } booleans" },
        { status: 400 },
      );
    }
    updates.preferences = {
      elderly: p.elderly,
      handicapped: p.handicapped,
      firstFloor: p.firstFloor,
    };
  }

  if ("key_count" in body) {
    const k = body.key_count;
    if (!Number.isInteger(k) || k < 0 || k > 50) {
      return NextResponse.json({ error: "key_count must be an integer between 0 and 50" }, { status: 400 });
    }
    updates.key_count = k;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("eckcm_groups")
    .select("id, registration_id, preferences, key_count")
    .eq("id", groupId)
    .single();

  if (!existing || existing.registration_id !== registrationId) {
    return NextResponse.json({ error: "Group not found in this registration" }, { status: 404 });
  }

  const { error } = await supabase
    .from("eckcm_groups")
    .update(updates)
    .eq("id", groupId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("eckcm_audit_logs").insert({
    user_id: admin.user.id,
    action: "EDIT_GROUP_DETAILS",
    entity_type: "group",
    entity_id: groupId,
    old_data: { preferences: existing.preferences, key_count: existing.key_count },
    new_data: { registration_id: registrationId, ...updates },
  });

  return NextResponse.json({ success: true });
}
