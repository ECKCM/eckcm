import { createClient } from "@/lib/supabase/server";
import { CheckinBackButton } from "@/components/checkin/back-button";
import { NewSessionForm } from "./new-session-form";

export default async function NewSessionPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year, event_start_date, event_end_date")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <CheckinBackButton href="/admin/checkin/session" />
        <h1 className="text-lg font-semibold">Create Session</h1>
      </div>
      <div className="p-6">
        <NewSessionForm events={events ?? []} />
      </div>
    </div>
  );
}
