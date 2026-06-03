import { createClient } from "@/lib/supabase/server";
import { ParticipantsTable } from "./participants-table";

export default async function ParticipantsPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year")
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  const { data: titles } = await supabase
    .from("eckcm_participant_titles")
    .select("id, name, color, is_active")
    .order("name");

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Participants</h1>
      </div>
      <div className="p-6">
        <ParticipantsTable events={events ?? []} titles={titles ?? []} />
      </div>
    </div>
  );
}
