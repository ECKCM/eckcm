import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";

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
    .from("ECKCM_staff_assignments")
    .select("id, event_id, is_active, ECKCM_roles(name)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (!assignments || assignments.length === 0) {
    redirect("/dashboard");
  }

  const isSuperAdmin = assignments.some(
    (a) =>
      a.ECKCM_roles &&
      (a.ECKCM_roles as unknown as { name: string }).name === "SUPER_ADMIN"
  );

  // Get events for sidebar
  const { data: events } = await supabase
    .from("ECKCM_events")
    .select("id, name_en, name_ko, year, is_active")
    .order("year", { ascending: false });

  return (
    <SidebarProvider>
      <AdminSidebar
        events={events ?? []}
        isSuperAdmin={isSuperAdmin}
      />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
