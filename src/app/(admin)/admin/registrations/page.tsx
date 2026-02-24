import { createClient } from "@/lib/supabase/server";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { RegistrationsTable } from "./registrations-table";

export default async function RegistrationsPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year")
    .order("year", { ascending: false });

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Registrations</h1>
      </header>
      <div className="p-6">
        <RegistrationsTable events={events ?? []} />
      </div>
    </div>
  );
}
