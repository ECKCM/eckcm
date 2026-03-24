import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { RegistrationsTable } from "./registrations-table";

export default async function RegistrationsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year, stripe_mode")
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Admin";

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Registrations</h1>
      </header>
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
