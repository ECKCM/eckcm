import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * POST /api/admin/registrations/[id]/participants/[membershipId]/transfer
 * Transfer a participant to a different registration by confirmation_code.
 * - Moves the group membership to the first group of the target registration
 * - Deactivates e-pass in old registration, creates new e-pass in target
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; membershipId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: registrationId, membershipId } = await params;
  const { targetRegistrationId } = await request.json();

  if (!targetRegistrationId) {
    return NextResponse.json({ error: "targetRegistrationId is required" }, { status: 400 });
  }

  if (targetRegistrationId === registrationId) {
    return NextResponse.json({ error: "Cannot transfer to the same registration" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify the membership belongs to the source registration
  const { data: membership } = await supabase
    .from("eckcm_group_memberships")
    .select(`
      id, person_id, role, participant_code,
      eckcm_groups!inner(id, registration_id)
    `)
    .eq("id", membershipId)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sourceGroup = membership.eckcm_groups as any;
  if (sourceGroup.registration_id !== registrationId) {
    return NextResponse.json(
      { error: "Membership does not belong to this registration" },
      { status: 400 }
    );
  }

  // Prevent transferring the last person
  const { data: allMembers } = await supabase
    .from("eckcm_group_memberships")
    .select("id, eckcm_groups!inner(registration_id)")
    .eq("eckcm_groups.registration_id", registrationId);

  const otherMembers = (allMembers ?? []).filter((m) => m.id !== membershipId);
  if (otherMembers.length === 0) {
    return NextResponse.json(
      { error: "Cannot transfer the last participant. Cancel the registration instead." },
      { status: 400 }
    );
  }

  // Find the target registration and its first group
  const { data: targetReg } = await supabase
    .from("eckcm_registrations")
    .select("id, confirmation_code, status")
    .eq("id", targetRegistrationId)
    .single();

  if (!targetReg) {
    return NextResponse.json({ error: "Target registration not found" }, { status: 404 });
  }

  if (targetReg.status === "CANCELLED" || targetReg.status === "REFUNDED") {
    return NextResponse.json(
      { error: `Cannot transfer to a ${targetReg.status} registration` },
      { status: 400 }
    );
  }

  // Get the first group in the target registration
  const { data: targetGroup } = await supabase
    .from("eckcm_groups")
    .select("id")
    .eq("registration_id", targetRegistrationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!targetGroup) {
    return NextResponse.json({ error: "Target registration has no groups" }, { status: 400 });
  }

  // Move the membership to the target group, demote to MEMBER
  const { error: updateError } = await supabase
    .from("eckcm_group_memberships")
    .update({
      group_id: targetGroup.id,
      role: "MEMBER",
    })
    .eq("id", membershipId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Deactivate e-pass in old registration
  await supabase
    .from("eckcm_epass_tokens")
    .update({ is_active: false })
    .eq("person_id", membership.person_id)
    .eq("registration_id", registrationId);

  // Create e-pass in target registration if it's APPROVED or PAID
  if (targetReg.status === "APPROVED" || targetReg.status === "PAID") {
    const token = crypto.randomUUID();
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(token));
    const tokenHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await supabase.from("eckcm_epass_tokens").insert({
      person_id: membership.person_id,
      registration_id: targetRegistrationId,
      token,
      token_hash: tokenHash,
      is_active: true,
    });
  }

  // Log the action
  await supabase.from("eckcm_audit_logs").insert({
    user_id: admin.user.id,
    action: "TRANSFER_PARTICIPANT",
    entity_type: "group_membership",
    entity_id: membershipId,
    new_data: {
      from_registration_id: registrationId,
      to_registration_id: targetRegistrationId,
      to_group_id: targetGroup.id,
      person_id: membership.person_id,
    },
  });

  return NextResponse.json({
    success: true,
    targetConfirmationCode: targetReg.confirmation_code,
  });
}
