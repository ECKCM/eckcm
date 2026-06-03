import { createClient } from "@/lib/supabase/server";
import { ParticipantTitlesManager } from "./participant-titles-manager";

export default async function ParticipantTitlesPage() {
  const supabase = await createClient();

  const { data: titles } = await supabase
    .from("eckcm_participant_titles")
    .select("*")
    .order("name");

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Participant Titles</h1>
      </div>
      <div className="p-6">
        <ParticipantTitlesManager initialTitles={titles ?? []} />
      </div>
    </div>
  );
}
