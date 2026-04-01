import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * PATCH /api/admin/registrations/[id]/lodging
 * Change lodging type for a registration's group.
 * Body: { groupId, lodgingType }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: registrationId } = await params;
  const { groupId, lodgingType } = await request.json();

  if (!groupId) {
    return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify the group belongs to this registration
  const { data: group } = await supabase
    .from("eckcm_groups")
    .select("id, registration_id, lodging_type")
    .eq("id", groupId)
    .single();

  if (!group || group.registration_id !== registrationId) {
    return NextResponse.json({ error: "Group not found in this registration" }, { status: 404 });
  }

  const oldLodgingType = group.lodging_type;

  // Update lodging type
  const { error: updateError } = await supabase
    .from("eckcm_groups")
    .update({ lodging_type: lodgingType || null })
    .eq("id", groupId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Audit log
  await supabase.from("eckcm_audit_logs").insert({
    user_id: admin.user.id,
    action: "CHANGE_LODGING_TYPE",
    entity_type: "group",
    entity_id: groupId,
    old_data: { lodging_type: oldLodgingType },
    new_data: { registration_id: registrationId, lodging_type: lodgingType || null },
  });

  return NextResponse.json({ success: true, lodging_type: lodgingType || null });
}
