"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/admin";

export async function assignStaffRole(
  targetUserId: string,
  eventId: string,
  roleId: string,
  roleName: string
): Promise<{ error?: string }> {
  const auth = await requireSuperAdmin();
  if (!auth) return { error: "Unauthorized" };

  const admin = createAdminClient();

  // Remove any existing assignment for this user+event (one role per user per event)
  await admin
    .from("eckcm_staff_assignments")
    .delete()
    .eq("user_id", targetUserId)
    .eq("event_id", eventId);

  // Insert new staff assignment
  const { error: insertError } = await admin
    .from("eckcm_staff_assignments")
    .insert({ user_id: targetUserId, event_id: eventId, role_id: roleId });

  if (insertError) {
    return { error: insertError.message };
  }

  // Sync eckcm_users.role to reflect the assigned staff role
  await admin
    .from("eckcm_users")
    .update({ role: roleName })
    .eq("id", targetUserId);

  return {};
}
