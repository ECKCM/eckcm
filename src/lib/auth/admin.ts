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

/**
 * Resolve the display name shown in admin UI (header presence, registration
 * locks, etc). Prefers the editable profile name (eckcm_people via
 * eckcm_user_people) so a super-admin name edit is reflected everywhere, then
 * falls back to OAuth metadata, email local-part, and finally "Admin".
 */
export async function getAdminDisplayName(user: User): Promise<string> {
  const supabase = await createClient();

  const { data: link } = await supabase
    .from("eckcm_user_people")
    .select("eckcm_people(first_name_en, last_name_en)")
    .eq("user_id", user.id)
    .maybeSingle();

  const person = (link?.eckcm_people as unknown as {
    first_name_en: string | null;
    last_name_en: string | null;
  } | null) ?? null;

  const profileName = [person?.first_name_en, person?.last_name_en]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    profileName ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Admin"
  );
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
