import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * DELETE /api/admin/registrations/[id]/participants/[membershipId]
 * Remove a participant from a registration group.
 * - Deletes the group membership
 * - Deactivates e-pass tokens for the person in this registration
 * - Does NOT delete the person record (they may be in other registrations)
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; membershipId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: registrationId, membershipId } = await params;
  const supabase = createAdminClient();

  // Verify the membership belongs to this registration
  const { data: membership } = await supabase
    .from("eckcm_group_memberships")
    .select(`
      id, person_id, role,
      eckcm_groups!inner(id, registration_id)
    `)
    .eq("id", membershipId)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const group = membership.eckcm_groups as any;
  if (group.registration_id !== registrationId) {
    return NextResponse.json(
      { error: "Membership does not belong to this registration" },
      { status: 400 }
    );
  }

  // Prevent deleting the last person in a registration
  const { count } = await supabase
    .from("eckcm_group_memberships")
    .select("id", { count: "exact", head: true })
    .eq("eckcm_groups.registration_id", registrationId)
    .not("id", "eq", membershipId);

  // The above query with join filter may not work correctly; use a different approach
  const { data: allMembers } = await supabase
    .from("eckcm_group_memberships")
    .select("id, eckcm_groups!inner(registration_id)")
    .eq("eckcm_groups.registration_id", registrationId);

  const otherMembers = (allMembers ?? []).filter((m) => m.id !== membershipId);
  if (otherMembers.length === 0) {
    return NextResponse.json(
      { error: "Cannot remove the last participant. Cancel the registration instead." },
      { status: 400 }
    );
  }

  // Deactivate e-pass tokens for this person in this registration
  await supabase
    .from("eckcm_epass_tokens")
    .update({ is_active: false })
    .eq("person_id", membership.person_id)
    .eq("registration_id", registrationId);

  // Delete the membership
  const { error: deleteError } = await supabase
    .from("eckcm_group_memberships")
    .delete()
    .eq("id", membershipId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Log the action
  await supabase.from("eckcm_audit_logs").insert({
    user_id: admin.user.id,
    action: "REMOVE_PARTICIPANT",
    entity_type: "group_membership",
    entity_id: membershipId,
    new_data: {
      registration_id: registrationId,
      person_id: membership.person_id,
      role: membership.role,
    },
  });

  return NextResponse.json({ success: true });
}
