import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminPresence } from "@/components/admin/admin-presence";
import { PermissionsProvider } from "@/contexts/permissions-context";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { UserMenu } from "@/components/shared/user-menu";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Middleware has already verified staff access and set these headers.
  // Avoid a duplicate DB query by reading from the forwarded request headers.
  const headersList = await headers();
  const rawPermissions = headersList.get("x-user-permissions");
  const rawRoles = headersList.get("x-user-roles");

  const permissions: string[] = rawPermissions ? JSON.parse(rawPermissions) : [];
  const roles: string[] = rawRoles ? JSON.parse(rawRoles) : [];
  const isSuperAdmin = roles.includes("SUPER_ADMIN");

  // Get events for sidebar
  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, name_ko, year, is_active, is_default")
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Admin";

  return (
    <PermissionsProvider permissions={permissions}>
      <SidebarProvider>
        <AdminSidebar
          events={events ?? []}
          permissions={permissions}
        />
        <SidebarInset className="admin-inset min-w-0 overflow-x-clip">
          {children}
        </SidebarInset>
        {/* Fixed right-side header — always visible regardless of layout */}
        <div className="fixed top-0 right-0 z-50 h-14 flex items-center gap-3 pr-4 pointer-events-none">
          <div className="flex items-center gap-3 pointer-events-auto">
            <AdminPresence
              currentUserId={user.id}
              currentUserEmail={user.email ?? ""}
              currentUserName={displayName}
            />
            <UserMenu isAdmin={isSuperAdmin} />
          </div>
        </div>
      </SidebarProvider>
    </PermissionsProvider>
  );
}
