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
    // 1. Clean up public schema data that cascades from eckcm_users
    //    (eckcm_users ON DELETE CASCADE from auth.users handles most,
    //     but we explicitly clean registrations chain which goes deeper)
    const { data: regs } = await admin
      .from("eckcm_registrations")
      .select("id")
      .eq("created_by_user_id", userId);

    if (regs && regs.length > 0) {
      const regIds = regs.map((r) => r.id);

      // Clean registration child tables
      await admin.from("eckcm_registration_locks").delete().in("registration_id", regIds);
      await admin.from("eckcm_registration_rides").delete().in("registration_id", regIds);
      await admin.from("eckcm_epass_tokens").delete().in("registration_id", regIds);
      await admin.from("eckcm_checkins").delete().in("registration_id", regIds);

      // Clean invoices chain
      const { data: invoices } = await admin
        .from("eckcm_invoices")
        .select("id")
        .in("registration_id", regIds);
      if (invoices && invoices.length > 0) {
        const invoiceIds = invoices.map((i) => i.id);
        await admin.from("eckcm_invoice_line_items").delete().in("invoice_id", invoiceIds);
        await admin.from("eckcm_payments").delete().in("invoice_id", invoiceIds);
        await admin.from("eckcm_refunds").delete().in("invoice_id", invoiceIds);
        await admin.from("eckcm_invoices").delete().in("id", invoiceIds);
      }

      // Clean groups chain
      const { data: groups } = await admin
        .from("eckcm_groups")
        .select("id")
        .in("registration_id", regIds);
      if (groups && groups.length > 0) {
        const groupIds = groups.map((g) => g.id);
        await admin.from("eckcm_group_memberships").delete().in("group_id", groupIds);
        await admin.from("eckcm_registration_group_fee_categories").delete().in("group_id", groupIds);
        await admin.from("eckcm_groups").delete().in("id", groupIds);
      }

      // Clean people (via group memberships already deleted, but also user_people)
      const { data: userPeople } = await admin
        .from("eckcm_user_people")
        .select("person_id")
        .eq("user_id", userId);
      if (userPeople && userPeople.length > 0) {
        const personIds = userPeople.map((up) => up.person_id);
        await admin.from("eckcm_user_people").delete().eq("user_id", userId);
        await admin.from("eckcm_people").delete().in("id", personIds);
      }

      // Delete registrations
      await admin.from("eckcm_registrations").delete().in("id", regIds);
    }

    // 2. Clean remaining direct references
    await admin.from("eckcm_registration_drafts").delete().eq("user_id", userId);
    await admin.from("eckcm_saved_persons").delete().eq("user_id", userId);
    await admin.from("eckcm_admin_presence").delete().eq("user_id", userId);
    await admin.from("eckcm_staff_assignments").delete().eq("user_id", userId);
    await admin.from("eckcm_notifications").delete().eq("user_id", userId);

    // 3. SET NULL references (audit_logs, email_logs, etc.)
    await admin.from("eckcm_audit_logs").update({ user_id: null }).eq("user_id", userId);
    await admin.from("eckcm_registrations").update({ created_by_user_id: null }).eq("created_by_user_id", userId);

    // 4. Delete eckcm_users row
    await admin.from("eckcm_users").delete().eq("id", userId);

    // 5. Delete auth.users row via Supabase Admin API
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

  // Audit log
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
