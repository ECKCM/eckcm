import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminPresence } from "@/components/admin/admin-presence";
import { PermissionsProvider } from "@/contexts/permissions-context";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { UserMenu } from "@/components/shared/user-menu";
import { getAdminDisplayName } from "@/lib/auth/admin";

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
  const headersList = await headers();
  const rawPermissions = headersList.get("x-user-permissions");
  const rawRoles = headersList.get("x-user-roles");

  const permissions: string[] = rawPermissions ? JSON.parse(rawPermissions) : [];
  const roles: string[] = rawRoles ? JSON.parse(rawRoles) : [];
  const isSuperAdmin = roles.includes("SUPER_ADMIN");

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, name_ko, year, is_active, is_default")
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  const displayName = await getAdminDisplayName(user);

  return (
    <PermissionsProvider permissions={permissions}>
      <SidebarProvider>
        <AdminSidebar
          events={events ?? []}
          permissions={permissions}
          roles={roles}
        />
        <SidebarInset className="admin-inset min-w-0 overflow-x-clip">
          <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-6" />
            <div className="flex-1" />
            <AdminPresence
              currentUserId={user.id}
              currentUserEmail={user.email ?? ""}
              currentUserName={displayName}
            />
            <UserMenu isAdmin={isSuperAdmin} />
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </PermissionsProvider>
  );
}
