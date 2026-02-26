import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

type AdminRole = "SUPER_ADMIN" | "EVENT_ADMIN";

interface AuthResult {
  user: User;
  roles: AdminRole[];
}

async function getStaffRoles(userId: string): Promise<AdminRole[]> {
  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("eckcm_staff_assignments")
    .select("id, eckcm_roles(name)")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!assignments) return [];

  return assignments
    .map((a) => (a.eckcm_roles as unknown as { name: string })?.name)
    .filter((name): name is AdminRole =>
      name === "SUPER_ADMIN" || name === "EVENT_ADMIN"
    );
}

/** Require SUPER_ADMIN or EVENT_ADMIN. Returns user + roles or null. */
export async function requireAdmin(): Promise<AuthResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const roles = await getStaffRoles(user.id);
  if (roles.length === 0) return null;

  return { user, roles };
}

/** Require SUPER_ADMIN only. Returns user + roles or null. */
export async function requireSuperAdmin(): Promise<AuthResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const roles = await getStaffRoles(user.id);
  if (!roles.includes("SUPER_ADMIN")) return null;

  return { user, roles };
}
