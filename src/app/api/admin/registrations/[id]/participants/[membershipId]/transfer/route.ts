import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { generateSafeConfirmationCode } from "@/lib/services/confirmation-code.service";

/**
 * POST /api/admin/registrations/[id]/participants/[membershipId]/transfer
 * Transfer a participant to a different registration (clone model).
 *
 * Rather than MOVING the membership (which made the person vanish from the
 * source registration), we:
 *   1. CLONE the person into the first group of the target registration as a
 *      new active MEMBER membership (fresh participant_code, carried stay dates).
 *   2. Record a tracking row in eckcm_participant_transfers (snapshot of the
 *      original membership + where it went) so the source registration keeps a
 *      record of who was on it and the original payment can be reconciled.
 *   3. Remove the original membership so active-participant queries (billing,
 *      check-in, e-pass, exports) don't double-count the person.
 *   4. Deactivate the e-pass in the old registration and create a new one in
 *      the target if it's APPROVED or PAID.
 *
 * The clone is created BEFORE the original is deleted, so a failure can never
 * lose the participant.
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

  // Verify the membership belongs to the source registration + snapshot fields.
  const { data: membership } = await supabase
    .from("eckcm_group_memberships")
    .select(`
      id, person_id, role, participant_code, group_id, stay_start_date, stay_end_date,
      eckcm_people!inner(id, first_name_en, last_name_en, display_name_ko),
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const person = membership.eckcm_people as any;

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

  // Generate a fresh, unique participant_code for the clone. participant_code
  // is a global lookup key (used by check-in), so it must not be reused.
  const candidates: string[] = [];
  for (let i = 0; i < 12; i++) candidates.push(generateSafeConfirmationCode());
  const { data: existingCodes } = await supabase
    .from("eckcm_group_memberships")
    .select("participant_code")
    .in("participant_code", candidates);
  const used = new Set((existingCodes ?? []).map((c: { participant_code: string }) => c.participant_code));
  const newParticipantCode = candidates.find((c) => !used.has(c)) ?? generateSafeConfirmationCode();

  // 1. Create the clone in the target group (active MEMBER, carry stay dates).
  const { data: clone, error: cloneError } = await supabase
    .from("eckcm_group_memberships")
    .insert({
      group_id: targetGroup.id,
      person_id: membership.person_id,
      role: "MEMBER",
      participant_code: newParticipantCode,
      stay_start_date: membership.stay_start_date ?? null,
      stay_end_date: membership.stay_end_date ?? null,
    })
    .select("id")
    .single();

  if (cloneError || !clone) {
    return NextResponse.json(
      { error: cloneError?.message ?? "Failed to create transferred participant" },
      { status: 500 }
    );
  }

  // 2. Record the tracking row before removing the original.
  const { error: trackError } = await supabase
    .from("eckcm_participant_transfers")
    .insert({
      person_id: membership.person_id,
      from_registration_id: registrationId,
      from_group_id: membership.group_id,
      to_registration_id: targetRegistrationId,
      to_group_id: targetGroup.id,
      to_membership_id: clone.id,
      original_role: membership.role,
      original_participant_code: membership.participant_code,
      new_participant_code: newParticipantCode,
      stay_start_date: membership.stay_start_date ?? null,
      stay_end_date: membership.stay_end_date ?? null,
      person_first_name: person?.first_name_en ?? null,
      person_last_name: person?.last_name_en ?? null,
      person_display_name_ko: person?.display_name_ko ?? null,
      transferred_by: admin.user.id,
    });

  if (trackError) {
    // Roll back the clone so we don't leave a duplicate.
    await supabase.from("eckcm_group_memberships").delete().eq("id", clone.id);
    return NextResponse.json({ error: trackError.message }, { status: 500 });
  }

  // 3. Remove the original membership.
  const { error: deleteError } = await supabase
    .from("eckcm_group_memberships")
    .delete()
    .eq("id", membershipId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // 4. Deactivate e-pass in old registration
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
      to_membership_id: clone.id,
      person_id: membership.person_id,
      original_participant_code: membership.participant_code,
      new_participant_code: newParticipantCode,
    },
  });

  return NextResponse.json({
    success: true,
    targetConfirmationCode: targetReg.confirmation_code,
  });
}
