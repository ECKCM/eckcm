import { createClient } from "@/lib/supabase/server";
import { KioskCheckinClient } from "./kiosk-checkin-client";

export default async function KioskCheckinPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year, event_start_date, event_end_date")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  return (
    <KioskCheckinClient
      events={(events ?? []).map((e) => ({
        id: e.id,
        name_en: e.name_en,
        year: e.year,
        start_date: e.event_start_date,
        end_date: e.event_end_date,
      }))}
    />
  );
}
