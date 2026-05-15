"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/admin";

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
    }
  }

  if (errors.length > 0) {
    return { error: errors.join("; "), deleted };
  }

  return { deleted };
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

  return {};
}
