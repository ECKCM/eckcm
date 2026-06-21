"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin, invalidateStaffRolesCache } from "@/lib/auth/admin";

export async function deleteUsers(
  userIds: string[]
): Promise<{ error?: string; deleted: number }> {
  const auth = await requireSuperAdmin();
  if (!auth) return { error: "Unauthorized", deleted: 0 };

  if (userIds.includes(auth.user.id)) {
    return { error: "You cannot delete your own account", deleted: 0 };
  }

  const admin = createAdminClient();
  let deleted = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    // All FK constraints use ON DELETE CASCADE or SET NULL,
    // so deleting from auth.users cascades through everything.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      errors.push(`${userId}: ${error.message}`);
    } else {
      deleted++;
      invalidateStaffRolesCache(userId);
    }
  }

  if (errors.length > 0) {
    return { error: errors.join("; "), deleted };
  }

  return { deleted };
}

export async function updateUserName(
  targetUserId: string,
  firstName: string,
  lastName: string
): Promise<{ error?: string; firstName?: string; lastName?: string }> {
  const auth = await requireSuperAdmin();
  if (!auth) return { error: "Unauthorized" };

  const first = firstName.trim();
  const last = lastName.trim();
  if (!first || !last) {
    return { error: "First and last name are required" };
  }

  const admin = createAdminClient();

  // The displayed name comes from the linked person record (eckcm_people),
  // resolved via eckcm_user_people — same fields the user edits in their own
  // profile settings.
  const { data: link } = await admin
    .from("eckcm_user_people")
    .select("person_id")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (!link?.person_id) {
    return {
      error: "This user has no linked profile, so there is no name to edit.",
    };
  }

  const { data: before } = await admin
    .from("eckcm_people")
    .select("first_name_en, last_name_en")
    .eq("id", link.person_id)
    .maybeSingle();

  const { error: updateError } = await admin
    .from("eckcm_people")
    .update({ first_name_en: first, last_name_en: last })
    .eq("id", link.person_id);

  if (updateError) {
    return { error: updateError.message };
  }

  await admin.from("eckcm_audit_logs").insert({
    user_id: auth.user.id,
    action: "UPDATE_USER_NAME",
    entity_type: "person",
    entity_id: link.person_id,
    old_data: before ?? null,
    new_data: { first_name_en: first, last_name_en: last },
  });

  return { firstName: first, lastName: last };
}

export async function assignStaffRole(
  targetUserId: string,
  eventId: string,
  roleId: string,
  roleName: string
): Promise<{ error?: string }> {
  const auth = await requireSuperAdmin();
  if (!auth) return { error: "Unauthorized" };

  const admin = createAdminClient();

  // For DEPARTMENT_ADMIN, the role row itself is scoped to a department, so
  // we keep one assignment per (user, event, role). Non-scoped roles get the
  // legacy one-per-(user, event) behaviour.
  if (roleName === "DEPARTMENT_ADMIN") {
    await admin
      .from("eckcm_staff_assignments")
      .delete()
      .eq("user_id", targetUserId)
      .eq("event_id", eventId)
      .eq("role_id", roleId);
  } else {
    await admin
      .from("eckcm_staff_assignments")
      .delete()
      .eq("user_id", targetUserId)
      .eq("event_id", eventId);
  }

  const { error: insertError } = await admin
    .from("eckcm_staff_assignments")
    .insert({ user_id: targetUserId, event_id: eventId, role_id: roleId });

  if (insertError) {
    return { error: insertError.message };
  }

  await admin
    .from("eckcm_users")
    .update({ role: roleName })
    .eq("id", targetUserId);

  await admin.from("eckcm_audit_logs").insert({
    user_id: auth.user.id,
    action: "ASSIGN_STAFF_ROLE",
    entity_type: "user",
    entity_id: targetUserId,
    event_id: eventId,
    new_data: { role: roleName, role_id: roleId },
  });

  // Drop any cached SUPER_ADMIN/EVENT_ADMIN check for this user so the new
  // role takes effect on their very next request, not after TTL.
  invalidateStaffRolesCache(targetUserId);

  return {};
}
