import { createClient } from "@/lib/supabase/server";
import { EventsTable } from "./events-table";

export default async function EventsPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("*")
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Events</h1>
      </div>
      <div className="p-6">
        <EventsTable events={events ?? []} />
      </div>
    </div>
  );
}
