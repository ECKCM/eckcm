import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { UsersManager } from "./users-manager";

export default async function UsersPage() {
  const supabase = createAdminClient();

  // Fetch users
  const { data: rawUsers } = await supabase
    .from("eckcm_users")
    .select("id, email, role, profile_completed, created_at")
    .order("created_at", { ascending: false });

  // Fetch user → person name mapping separately
  const { data: userPeople } = await supabase
    .from("eckcm_user_people")
    .select("user_id, person_id, eckcm_people(first_name_en, last_name_en)");

  const nameMap = new Map<string, { firstName: string; lastName: string }>();
  for (const up of userPeople ?? []) {
    const p = up.eckcm_people as any;
    if (p?.first_name_en) {
      nameMap.set(up.user_id, {
        firstName: p.first_name_en,
        lastName: p.last_name_en,
      });
    }
  }

  // Fetch auth providers via RPC (reads from auth.users securely — needs user session)
  const userClient = await createClient();
  const { data: providerRows } = await userClient.rpc("get_auth_providers");

  const providersMap = new Map<string, string[]>();
  for (const row of providerRows ?? []) {
    const providers: string[] = Array.isArray(row.providers) ? row.providers : [];
    providersMap.set(row.user_id, providers.length > 0 ? providers : ["email"]);
  }

  // Flatten user data for the client
  const users = (rawUsers ?? []).map((u: any) => {
    const name = nameMap.get(u.id);
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      firstName: name?.firstName ?? null,
      lastName: name?.lastName ?? null,
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
    .order("is_default", { ascending: false })
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
