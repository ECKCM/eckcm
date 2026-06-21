import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

type AdminRole = "SUPER_ADMIN" | "EVENT_ADMIN";

interface AuthResult {
  user: User;
  roles: AdminRole[];
}

// Short-lived in-process cache for staff role lookups. The check-in scanner
// hits requireAdmin() on every verify; without caching that's an extra round
// trip per scan to read a row that almost never changes within a session.
// 5 seconds is short enough that a role revocation is felt within "one scan"
// of operator time but long enough to coalesce a real burst.
const ROLE_CACHE_TTL_MS = 5_000;
const roleCache = new Map<string, { roles: AdminRole[]; expiresAt: number }>();

async function getStaffRoles(userId: string): Promise<AdminRole[]> {
  const now = Date.now();
  const hit = roleCache.get(userId);
  if (hit && hit.expiresAt > now) return hit.roles;

  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("eckcm_staff_assignments")
    .select("id, eckcm_roles(name)")
    .eq("user_id", userId)
    .eq("is_active", true);

  const roles = (assignments ?? [])
    .map((a) => (a.eckcm_roles as unknown as { name: string })?.name)
    .filter((name): name is AdminRole =>
      name === "SUPER_ADMIN" || name === "EVENT_ADMIN"
    );

  roleCache.set(userId, { roles, expiresAt: now + ROLE_CACHE_TTL_MS });
  return roles;
}

/**
 * Drop a user's cached roles. Call this from any endpoint that grants or
 * revokes staff assignments so the change is felt instantly, not on TTL.
 */
export function invalidateStaffRolesCache(userId?: string): void {
  if (userId) roleCache.delete(userId);
  else roleCache.clear();
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
