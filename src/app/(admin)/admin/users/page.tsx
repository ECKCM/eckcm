import { createClient } from "@/lib/supabase/server";
import { UsersManager } from "./users-manager";

export default async function UsersPage() {
  const supabase = await createClient();

  const { data: users } = await supabase
    .from("ECKCM_users")
    .select("id, email, auth_provider, profile_completed, created_at")
    .order("created_at", { ascending: false });

  const { data: events } = await supabase
    .from("ECKCM_events")
    .select("id, name_en, year")
    .order("year", { ascending: false });

  const { data: roles } = await supabase
    .from("ECKCM_roles")
    .select("id, name, description_en")
    .order("name");

  return (
    <UsersManager
      users={users ?? []}
      events={events ?? []}
      roles={roles ?? []}
    />
  );
}
