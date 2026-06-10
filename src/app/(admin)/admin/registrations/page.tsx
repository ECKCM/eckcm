import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RegistrationsTable } from "./registrations-table";
import { getAdminDisplayName } from "@/lib/auth/admin";

export default async function RegistrationsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year, stripe_mode")
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  const displayName = await getAdminDisplayName(user);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Registrations</h1>
      </div>
      <div className="p-6">
        <RegistrationsTable
          events={events ?? []}
          currentUserId={user.id}
          currentUserName={displayName}
        />
      </div>
    </div>
  );
}
