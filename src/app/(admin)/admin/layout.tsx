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
import { GlobalSearch } from "@/components/admin/global-search";
import {
  MoneyVisibilityProvider,
  MoneyToggle,
} from "@/contexts/money-visibility-context";

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
      {/* When any admin page invokes window.print(), hide the persistent app
          chrome (sidebar + sticky header) and drop the inset offset so the
          printed content starts at the top-left of the sheet. Print pages
          (lanyard / registrations / qr-cards) only mark their own on-screen
          controls no-print; the layout chrome lives here, so it must be hidden
          here. data-sidebar / data-admin-header are stable hooks that don't
          depend on the sidebar's utility-class soup. */}
      <style>{`
        @media print {
          .group.peer[data-side],
          [data-sidebar="sidebar"],
          [data-admin-header] {
            display: none !important;
          }
          .admin-inset {
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
      <SidebarProvider>
        <AdminSidebar
          events={events ?? []}
          permissions={permissions}
          roles={roles}
        />
        <SidebarInset className="admin-inset min-w-0 overflow-x-clip">
          <MoneyVisibilityProvider>
            <header
              data-admin-header
              className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-4"
            >
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="h-6" />
              <div className="flex min-w-0 flex-1 items-center">
                <GlobalSearch permissions={permissions} />
              </div>
              {/* Presence avatars take meaningful width — keep them for tablets
                  and up, but hide on phones so the search box stays usable. */}
              <div className="hidden sm:flex">
                <AdminPresence
                  currentUserId={user.id}
                  currentUserEmail={user.email ?? ""}
                  currentUserName={displayName}
                />
              </div>
              <MoneyToggle />
              <UserMenu isAdmin={isSuperAdmin} />
            </header>
            {children}
          </MoneyVisibilityProvider>
        </SidebarInset>
      </SidebarProvider>
    </PermissionsProvider>
  );
}
