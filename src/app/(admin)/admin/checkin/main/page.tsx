import { createClient } from "@/lib/supabase/server";
import { CheckinBackButton } from "@/components/checkin/back-button";
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
      {/* Header is desktop-only — on phones every pixel goes to the scanner
          and scan result, so the title bar is hidden. */}
      <div className="hidden sm:flex items-center gap-2 border-b px-4 py-3">
        <CheckinBackButton />
        <h1 className="text-lg font-semibold">Main Check-in</h1>
      </div>
      <div className="p-3 sm:p-6">
        <MainCheckinClient events={events ?? []} />
      </div>
    </div>
  );
}
