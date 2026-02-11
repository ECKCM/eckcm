import { createClient } from "@/lib/supabase/server";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { UsersManager } from "./users-manager";

export default async function UsersPage() {
  const supabase = await createClient();

  const { data: users } = await supabase
    .from("eckcm_users")
    .select("id, email, auth_provider, profile_completed, created_at")
    .order("created_at", { ascending: false });

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year")
    .order("year", { ascending: false });

  const { data: roles } = await supabase
    .from("eckcm_roles")
    .select("id, name, description_en")
    .order("name");

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Users</h1>
      </header>
      <div className="p-6">
        <UsersManager
          users={users ?? []}
          events={events ?? []}
          roles={roles ?? []}
        />
      </div>
    </div>
  );
}
