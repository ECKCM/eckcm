"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/admin";

/**
 * Ensure a DEPARTMENT_ADMIN role row exists for the given department, and
 * that it has the `department.view` permission granted. Idempotent.
 *
 * Called by departments-manager after creating or updating a department so
 * each dept always has its matching role visible in /admin/settings/roles.
 */
export async function ensureDepartmentRole(
  departmentId: string
): Promise<{ error?: string; roleId?: string }> {
  const auth = await requireSuperAdmin();
  if (!auth) return { error: "Unauthorized" };

  const admin = createAdminClient();

  const { data: dept, error: deptErr } = await admin
    .from("eckcm_departments")
    .select("id, name_en, name_ko")
    .eq("id", departmentId)
    .maybeSingle();

  if (deptErr || !dept) {
    return { error: deptErr?.message ?? "Department not found" };
  }

  // Upsert role
  const rolePayload = {
    name: "DEPARTMENT_ADMIN" as const,
    description_en: `${dept.name_en} Department Viewer`,
    description_ko: `${dept.name_ko ?? dept.name_en} 부서 뷰어`,
    is_system: true,
    department_id: dept.id,
  };

  const { data: existing } = await admin
    .from("eckcm_roles")
    .select("id")
    .eq("name", "DEPARTMENT_ADMIN")
    .eq("department_id", dept.id)
    .maybeSingle();

  let roleId = existing?.id as string | undefined;

  if (roleId) {
    await admin
      .from("eckcm_roles")
      .update({
        description_en: rolePayload.description_en,
        description_ko: rolePayload.description_ko,
        is_system: true,
      })
      .eq("id", roleId);
  } else {
    const { data: created, error: insertErr } = await admin
      .from("eckcm_roles")
      .insert(rolePayload)
      .select("id")
      .single();
    if (insertErr || !created) {
      return { error: insertErr?.message ?? "Failed to create role" };
    }
    roleId = created.id;
  }

  // Grant department.view if not already granted
  const { data: perm } = await admin
    .from("eckcm_permissions")
    .select("id")
    .eq("code", "department.view")
    .maybeSingle();

  if (perm && roleId) {
    await admin
      .from("eckcm_role_permissions")
      .upsert(
        { role_id: roleId, permission_id: perm.id },
        { onConflict: "role_id,permission_id" }
      );
  }

  return { roleId };
}
