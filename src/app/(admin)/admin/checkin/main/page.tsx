import { createClient } from "@/lib/supabase/server";
import { MainCheckinClient } from "./main-checkin-client";

export default async function MainCheckinPage() {
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
        <h1 className="text-lg font-semibold">Main Check-in</h1>
      </div>
      <div className="p-6">
        <MainCheckinClient events={events ?? []} />
      </div>
    </div>
  );
}
