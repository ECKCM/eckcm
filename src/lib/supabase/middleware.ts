import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRequiredPermission } from "@/lib/permissions";

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

    // Fetch staff assignments with full role → permission chain
    const { data: assignments } = await supabase
      .from("eckcm_staff_assignments")
      .select(`
        eckcm_roles(
          name,
          eckcm_role_permissions(
            eckcm_permissions(code)
          )
        )
      `)
      .eq("user_id", user.id)
      .eq("is_active", true);

    // Must have at least one active staff assignment
    if (!assignments || assignments.length === 0) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    // Extract unique roles and permission codes across all assignments
    const roles: string[] = [];
    const permissionsSet = new Set<string>();

    for (const assignment of assignments) {
      const role = assignment.eckcm_roles as unknown as {
        name: string;
        eckcm_role_permissions: { eckcm_permissions: { code: string } | null }[];
      } | null;

      if (role?.name) {
        roles.push(role.name);
        for (const rp of role.eckcm_role_permissions ?? []) {
          if (rp.eckcm_permissions?.code) {
            permissionsSet.add(rp.eckcm_permissions.code);
          }
        }
      }
    }

    const permissions = [...permissionsSet];
    const { pathname } = request.nextUrl;

    // Check route-level permission (skip for always-open routes)
    if (!pathname.startsWith("/admin/unauthorized")) {
      const required = getRequiredPermission(pathname);
      if (required && !permissions.includes(required)) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin/unauthorized";
        return NextResponse.redirect(url);
      }
    }

    // Forward permissions and roles to server components via request headers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-permissions", JSON.stringify(permissions));
    requestHeaders.set("x-user-roles", JSON.stringify(roles));

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
