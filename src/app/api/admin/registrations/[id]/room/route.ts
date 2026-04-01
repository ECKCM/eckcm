import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * PATCH /api/admin/registrations/[id]/room
 * Change or assign room for a registration's group.
 * Body: { groupId, roomId } — roomId can be null to unassign.
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
  const { groupId, roomId } = await request.json();

  if (!groupId) {
    return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify the group belongs to this registration
  const { data: group } = await supabase
    .from("eckcm_groups")
    .select("id, registration_id, room_assign_status")
    .eq("id", groupId)
    .single();

  if (!group || group.registration_id !== registrationId) {
    return NextResponse.json({ error: "Group not found in this registration" }, { status: 404 });
  }

  // Delete existing room assignment for this group
  await supabase
    .from("eckcm_room_assignments")
    .delete()
    .eq("group_id", groupId);

  if (roomId) {
    // Verify room exists and is available
    const { data: room } = await supabase
      .from("eckcm_rooms")
      .select("id, room_number, is_available")
      .eq("id", roomId)
      .single();

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // Insert new assignment
    const { error: insertError } = await supabase
      .from("eckcm_room_assignments")
      .insert({
        group_id: groupId,
        room_id: roomId,
        assigned_by: admin.user.id,
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Update group status to ASSIGNED
    await supabase
      .from("eckcm_groups")
      .update({ room_assign_status: "ASSIGNED" })
      .eq("id", groupId);

    // Log
    await supabase.from("eckcm_audit_logs").insert({
      user_id: admin.user.id,
      action: "CHANGE_ROOM",
      entity_type: "group",
      entity_id: groupId,
      new_data: { registration_id: registrationId, room_id: roomId, room_number: room.room_number },
    });

    return NextResponse.json({ success: true, room_number: room.room_number });
  } else {
    // Unassign — set group back to PENDING
    await supabase
      .from("eckcm_groups")
      .update({ room_assign_status: "PENDING" })
      .eq("id", groupId);

    await supabase.from("eckcm_audit_logs").insert({
      user_id: admin.user.id,
      action: "UNASSIGN_ROOM",
      entity_type: "group",
      entity_id: groupId,
      new_data: { registration_id: registrationId },
    });

    return NextResponse.json({ success: true, room_number: null });
  }
}
