import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
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

  // Check staff assignments with role info
  const { data: assignments } = await supabase
    .from("eckcm_staff_assignments")
    .select("id, event_id, is_active, eckcm_roles(name)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (!assignments || assignments.length === 0) {
    redirect("/dashboard");
  }

  const isSuperAdmin = assignments.some(
    (a) =>
      a.eckcm_roles &&
      (a.eckcm_roles as unknown as { name: string }).name === "SUPER_ADMIN"
  );

  // Get events for sidebar
  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, name_ko, year, is_active")
    .order("year", { ascending: false });

  return (
    <SidebarProvider>
      <AdminSidebar
        events={events ?? []}
        isSuperAdmin={isSuperAdmin}
      />
      <SidebarInset className="overflow-x-auto">
        <div className="relative min-w-0 w-full">
          <div className="absolute right-4 top-3 z-20">
            <UserMenu isAdmin={isSuperAdmin} />
          </div>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
