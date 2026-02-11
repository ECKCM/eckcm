import { createClient } from "@/lib/supabase/server";
import { RoomGroupsTable } from "./room-groups-table";

export default async function RoomGroupsPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("ECKCM_events")
    .select("id, name_en, year")
    .order("year", { ascending: false });

  return <RoomGroupsTable events={events ?? []} />;
}
