import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRequiredPermission, hasRequiredPermission } from "@/lib/permissions";
import type { SupabaseClient, User } from "@supabase/supabase-js";

// Staff/admins are capped to a 1-day session, EXCEPT SUPER_ADMIN / EVENT_ADMIN
// and UPJ_STAFF (long-running meal kiosks must not be force-signed-out mid-meal).
const MAX_STAFF_SESSION_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * Fetch all active staff role names for a user. Returns [] for regular
 * participants (no active assignment). Centralised so the various scope
 * checks in this middleware don't drift apart.
 */
async function getStaffRoleNames(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("eckcm_staff_assignments")
    .select("eckcm_roles(name)")
    .eq("user_id", userId)
    .eq("is_active", true);
  return (data ?? [])
    .map((a) => (a.eckcm_roles as unknown as { name: string } | null)?.name)
    .filter((name): name is string => Boolean(name));
}

/** True when the user has UPJ_STAFF and no broader admin role. */
function isUpjStaffOnlyRole(roles: string[]): boolean {
  return (
    roles.includes("UPJ_STAFF") &&
    !roles.includes("SUPER_ADMIN") &&
    !roles.includes("EVENT_ADMIN") &&
    !roles.includes("DEPARTMENT_ADMIN")
  );
}

/** True when the user can view the /upj-staff dashboard. */
function hasUpjDashboardAccess(roles: string[]): boolean {
  return (
    roles.includes("UPJ_STAFF") ||
    roles.includes("SUPER_ADMIN") ||
    roles.includes("EVENT_ADMIN")
  );
}

/**
 * Whether this user's session should be force-expired.
 *
 * Anchored on `last_sign_in_at`, which is set at actual authentication and
 * does NOT change on token refresh — so the session truly dies 24h after the
 * user signed in, no matter how many times the access token was refreshed.
 *
 * Scope: only staff/admin users whose roles are neither SUPER_ADMIN nor
 * EVENT_ADMIN. Super/event admins are exempt, and regular participants (no
 * active staff assignment) are not capped at all. The role lookup only runs
 * once the session is already older than the cap, so the common path stays
 * query-free.
 */
async function isSessionExpiredForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  user: User
): Promise<boolean> {
  if (!user.last_sign_in_at) return false;
  const signedInAt = new Date(user.last_sign_in_at).getTime();
  if (Number.isNaN(signedInAt)) return false;
  if (Date.now() - signedInAt <= MAX_STAFF_SESSION_MS) return false;

  const { data: assignments } = await supabase
    .from("eckcm_staff_assignments")
    .select("eckcm_roles(name)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  // No active staff assignment → regular participant → not capped.
  if (!assignments || assignments.length === 0) return false;

  const roleNames = assignments
    .map((a) => (a.eckcm_roles as unknown as { name: string } | null)?.name)
    .filter((name): name is string => Boolean(name));

  // SUPER_ADMIN / EVENT_ADMIN keep their session. UPJ_STAFF is also exempt:
  // they run long meal-kiosk sessions (often spanning >24h on a left-on iPad),
  // and a mid-meal forced sign-out silently stops scanning. The 24h cap is a
  // shared-admin-account safeguard that doesn't fit the kiosk operator.
  if (
    roleNames.includes("SUPER_ADMIN") ||
    roleNames.includes("EVENT_ADMIN") ||
    roleNames.includes("UPJ_STAFF")
  ) {
    return false;
  }

  return true;
}

export async function updateSession(request: NextRequest) {
  // Skip auth check for OAuth callback to prevent getUser() from
  // clearing the PKCE code verifier cookie before the code exchange
  if (request.nextUrl.pathname.startsWith("/callback")) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do not write any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Stale/invalid refresh token — clear cookies and redirect to login.
  // This prevents the error from repeating on every subsequent request.
  if (authError?.code === "refresh_token_not_found") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const response = NextResponse.redirect(url);
    // Clear all Supabase auth cookies
    request.cookies.getAll().forEach((cookie) => {
      if (cookie.name.startsWith("sb-")) {
        response.cookies.delete(cookie.name);
      }
    });
    return response;
  }

  // 1-day session cap for staff/admins (except SUPER_ADMIN / EVENT_ADMIN).
  // Clear the auth cookies and bounce to /login so they must sign in again.
  if (user && (await isSessionExpiredForUser(supabase, user))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const response = NextResponse.redirect(url);
    request.cookies.getAll().forEach((cookie) => {
      if (cookie.name.startsWith("sb-")) {
        response.cookies.delete(cookie.name);
      }
    });
    return response;
  }

  // Protected participant routes (/dashboard, /register). UPJ_STAFF-only users
  // are external lodging partners with no participant profile or registration
  // flow, so they're bounced to /upj-staff instead of seeing an empty profile.
  if (
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/register")
  ) {
    if (!user) {
      if (request.nextUrl.pathname.startsWith("/dashboard")) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
      }
      // /register/** when signed out is handled by the protected layout
      // (it kicks off the registration sign-in flow with the right next= param).
    } else {
      const roleNames = await getStaffRoleNames(supabase, user.id);
      if (isUpjStaffOnlyRole(roleNames)) {
        const url = request.nextUrl.clone();
        url.pathname = "/upj-staff";
        return NextResponse.redirect(url);
      }
    }
  }

  // UPJ Staff section. /upj-staff/login is the public sign-in for UPJ staff;
  // everything else under /upj-staff requires an active UPJ_STAFF assignment
  // (or any broader admin role, so super-admins can preview the dashboard).
  if (request.nextUrl.pathname.startsWith("/upj-staff")) {
    const isLoginPage = request.nextUrl.pathname === "/upj-staff/login";

    if (isLoginPage) {
      // Already-signed-in UPJ users go straight to the dashboard.
      if (user) {
        const roleNames = await getStaffRoleNames(supabase, user.id);
        if (hasUpjDashboardAccess(roleNames)) {
          const url = request.nextUrl.clone();
          url.pathname = "/upj-staff";
          return NextResponse.redirect(url);
        }
      }
      return supabaseResponse;
    }

    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/upj-staff/login";
      return NextResponse.redirect(url);
    }

    const roleNames = await getStaffRoleNames(supabase, user.id);
    if (!hasUpjDashboardAccess(roleNames)) {
      // Signed in but not UPJ — bounce to the regular dashboard instead of
      // leaving them on an empty page.
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  }

  // Admin routes: require authentication + active staff assignment
  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // Fetch staff assignments with full role → permission chain.
    // Try with role.department_id (post-migration); fall back to a schema
    // without that column so admin pages keep working pre-migration.
    const richSelect = `
      eckcm_roles(
        name,
        department_id,
        eckcm_role_permissions(
          eckcm_permissions(code)
        )
      )
    `;
    const fallbackSelect = `
      eckcm_roles(
        name,
        eckcm_role_permissions(
          eckcm_permissions(code)
        )
      )
    `;

    let assignmentsResult = await supabase
      .from("eckcm_staff_assignments")
      .select(richSelect)
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (assignmentsResult.error) {
      const fallback = await supabase
        .from("eckcm_staff_assignments")
        .select(fallbackSelect)
        .eq("user_id", user.id)
        .eq("is_active", true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assignmentsResult = fallback as any;
    }

    const assignments = assignmentsResult.data;

    // Must have at least one active staff assignment
    if (!assignments || assignments.length === 0) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    // Extract unique roles, permission codes, and department scope.
    // Department scope is sourced from role.department_id — each
    // DEPARTMENT_ADMIN role row is bound to exactly one department.
    const roles: string[] = [];
    const permissionsSet = new Set<string>();
    const departmentIds: string[] = [];

    for (const assignment of assignments) {
      const a = assignment as unknown as {
        eckcm_roles: {
          name: string;
          department_id?: string | null;
          eckcm_role_permissions: { eckcm_permissions: { code: string } | null }[];
        } | null;
      };

      const role = a.eckcm_roles;
      if (!role?.name) continue;

      if (role.department_id) departmentIds.push(role.department_id);

      roles.push(role.name);
      for (const rp of role.eckcm_role_permissions ?? []) {
        if (rp.eckcm_permissions?.code) {
          permissionsSet.add(rp.eckcm_permissions.code);
        }
      }
    }

    const permissions = [...permissionsSet];
    const { pathname } = request.nextUrl;

    // Airport-shuttle-driver scope: if the user has AIRPORT_SHUTTLE_DRIVER
    // and no broader admin role, restrict them to /admin/airport/**.
    // This bypasses the standard permission gate (the airport route is
    // normally gated on participant.read which shuttle drivers don't have).
    const isAirportShuttleDriverOnly =
      roles.includes("AIRPORT_SHUTTLE_DRIVER") &&
      !roles.includes("SUPER_ADMIN") &&
      !roles.includes("EVENT_ADMIN") &&
      !roles.includes("DEPARTMENT_ADMIN");

    // Department-viewer (Hansamo) scope: if the user has DEPARTMENT_VIEWER_HANSAMO
    // and no broader admin role, restrict them to the Hansamo roster
    // (/admin/department-view/**) and the Willow Hall assignment page
    // (/admin/lodging/willow/**). Like the shuttle-driver scope, this bypasses
    // the standard permission gate (those routes are normally gated on
    // participant.read / group.read which this viewer doesn't have); the
    // department-view pages self-enforce the Hansamo department scope via the
    // forwarded x-user-department-ids header.
    const isHansamoViewerOnly =
      roles.includes("DEPARTMENT_VIEWER_HANSAMO") &&
      !roles.includes("SUPER_ADMIN") &&
      !roles.includes("EVENT_ADMIN") &&
      !roles.includes("DEPARTMENT_ADMIN");

    // UPJ Staff scope: if the user has UPJ_STAFF and no broader admin role,
    // restrict them to /admin/checkin/meal and /admin/checkin/scan-sessions
    // (the two admin pages reachable from the /upj-staff dashboard). Like the
    // other narrow scopes, this bypasses the standard permission gate — those
    // routes are normally gated on checkin.dining / checkin.main which UPJ
    // staff intentionally don't have as table-driven permissions.
    const isUpjStaffOnly =
      roles.includes("UPJ_STAFF") &&
      !roles.includes("SUPER_ADMIN") &&
      !roles.includes("EVENT_ADMIN") &&
      !roles.includes("DEPARTMENT_ADMIN");

    if (isAirportShuttleDriverOnly) {
      const isAirportRoute =
        pathname === "/admin/airport" ||
        pathname.startsWith("/admin/airport/") ||
        pathname.startsWith("/admin/unauthorized");
      if (!isAirportRoute) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin/airport";
        return NextResponse.redirect(url);
      }
    } else if (isHansamoViewerOnly) {
      const isAllowedRoute =
        pathname === "/admin/department-view" ||
        pathname.startsWith("/admin/department-view/") ||
        pathname === "/admin/lodging/willow" ||
        pathname.startsWith("/admin/lodging/willow/") ||
        pathname.startsWith("/admin/unauthorized");
      if (!isAllowedRoute) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin/department-view";
        return NextResponse.redirect(url);
      }
    } else if (isUpjStaffOnly) {
      const isAllowedRoute =
        pathname === "/admin/checkin/kiosk" ||
        pathname.startsWith("/admin/checkin/kiosk/") ||
        pathname === "/admin/checkin/scan-sessions" ||
        pathname.startsWith("/admin/checkin/scan-sessions/") ||
        pathname.startsWith("/admin/unauthorized");
      if (!isAllowedRoute) {
        const url = request.nextUrl.clone();
        url.pathname = "/upj-staff";
        return NextResponse.redirect(url);
      }
    } else if (!pathname.startsWith("/admin/unauthorized")) {
      // Standard route-level permission check
      const required = getRequiredPermission(pathname);
      if (required && !hasRequiredPermission(required, permissions)) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin/unauthorized";
        return NextResponse.redirect(url);
      }
    }

    // Forward permissions, roles, and department scope to server components
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-permissions", JSON.stringify(permissions));
    requestHeaders.set("x-user-roles", JSON.stringify(roles));
    requestHeaders.set("x-user-department-ids", JSON.stringify([...new Set(departmentIds)]));

    const newResponse = NextResponse.next({ request: { headers: requestHeaders } });

    // Carry over any cookies set by supabase (e.g. token refresh)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      newResponse.cookies.set(cookie.name, cookie.value, {
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite as "lax" | "strict" | "none" | undefined,
        maxAge: cookie.maxAge,
        path: cookie.path,
        domain: cookie.domain,
      });
    });

    return newResponse;
  }

  // Auth routes: redirect to the right home if already authenticated.
  // UPJ_STAFF-only users go to /upj-staff (their dashboard), everyone else
  // to /dashboard (participant profile).
  if (
    user &&
    (request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/signup")
  ) {
    const roleNames = await getStaffRoleNames(supabase, user.id);
    const url = request.nextUrl.clone();
    url.pathname = isUpjStaffOnlyRole(roleNames) ? "/upj-staff" : "/dashboard";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as is.
  return supabaseResponse;
}
