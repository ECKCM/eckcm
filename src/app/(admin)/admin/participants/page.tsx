import { createClient } from "@/lib/supabase/server";
import { ParticipantsTable } from "./participants-table";

export default async function ParticipantsPage() {
  const supabase = await createClient();

  // Get active events for filter
  const { data: events } = await supabase
    .from("ECKCM_events")
    .select("id, name_en, year")
    .order("year", { ascending: false });

  return <ParticipantsTable events={events ?? []} />;
}
