import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRequiredPermission, hasRequiredPermission } from "@/lib/permissions";
import type { SupabaseClient, User } from "@supabase/supabase-js";

// Staff/admins below SUPER_ADMIN / EVENT_ADMIN are capped to a 1-day session.
const MAX_STAFF_SESSION_MS = 24 * 60 * 60 * 1000; // 1 day

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

  // SUPER_ADMIN / EVENT_ADMIN keep their session.
  if (roleNames.includes("SUPER_ADMIN") || roleNames.includes("EVENT_ADMIN")) {
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

  // Protected routes: redirect to login if not authenticated
  if (
    !user &&
    request.nextUrl.pathname.startsWith("/dashboard")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
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
    // and no broader admin role, restrict them to /admin/lodging/willow/**.
    // Like the shuttle-driver scope, this bypasses the standard permission gate
    // (willow is normally gated on group.read which this viewer doesn't have).
    const isHansamoWillowViewerOnly =
      roles.includes("DEPARTMENT_VIEWER_HANSAMO") &&
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
    } else if (isHansamoWillowViewerOnly) {
      const isWillowRoute =
        pathname === "/admin/lodging/willow" ||
        pathname.startsWith("/admin/lodging/willow/") ||
        pathname.startsWith("/admin/unauthorized");
      if (!isWillowRoute) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin/lodging/willow";
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

  // Auth routes: redirect to dashboard if already authenticated
  if (
    user &&
    (request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/signup")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as is.
  return supabaseResponse;
}
