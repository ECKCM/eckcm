import { createClient } from "@/lib/supabase/server";
import { CheckinBackButton } from "@/components/checkin/back-button";
import { ScanSessionsListClient } from "./scan-sessions-list-client";

export default async function ScanSessionsListPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <CheckinBackButton />
        <h1 className="text-lg font-semibold">Scan Sessions</h1>
      </div>
      <div className="p-6">
        <ScanSessionsListClient events={events ?? []} />
      </div>
    </div>
  );
}
