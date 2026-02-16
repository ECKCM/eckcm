import { createClient } from "@/lib/supabase/server";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { UsersManager } from "./users-manager";

export default async function UsersPage() {
  const supabase = await createClient();

  // Fetch users with linked person names
  const { data: rawUsers } = await supabase
    .from("eckcm_users")
    .select(
      `id, email, role, profile_completed, created_at,
       eckcm_user_people(eckcm_people(first_name_en, last_name_en))`
    )
    .order("created_at", { ascending: false });

  // Fetch auth providers via RPC (reads from auth.users securely)
  const { data: providerRows } = await supabase.rpc("get_auth_providers");

  const providersMap = new Map<string, string[]>();
  for (const row of providerRows ?? []) {
    const providers: string[] = Array.isArray(row.providers) ? row.providers : [];
    providersMap.set(row.user_id, providers.length > 0 ? providers : ["email"]);
  }

  // Flatten user data for the client
  const users = (rawUsers ?? []).map((u: any) => {
    const person = u.eckcm_user_people?.[0]?.eckcm_people ?? null;
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      firstName: person?.first_name_en ?? null,
      lastName: person?.last_name_en ?? null,
      providers: providersMap.get(u.id) ?? ["email"],
      profile_completed: u.profile_completed,
      created_at: u.created_at,
    };
  });

  // Fetch roles for filter + assign dialog
  const { data: roles } = await supabase
    .from("eckcm_roles")
    .select("id, name, description_en")
    .order("name");

  // Fetch events for assign dialog
  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year")
    .order("year", { ascending: false });

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Users</h1>
      </header>
      <div className="p-6">
        <UsersManager
          users={users}
          roles={roles ?? []}
          events={events ?? []}
        />
      </div>
    </div>
  );
}
