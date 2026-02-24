import { createClient } from "@/lib/supabase/server";
import { KioskCheckinClient } from "./kiosk-checkin-client";

export default async function KioskCheckinPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  return <KioskCheckinClient events={events ?? []} />;
}
