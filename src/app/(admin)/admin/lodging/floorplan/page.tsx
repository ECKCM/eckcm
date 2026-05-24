import { createClient } from "@/lib/supabase/server";
import { FloorplanAssignmentManager } from "./floorplan-assignment-manager";

export default async function FloorPlanAssignmentPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year")
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Floor Plan Assignment</h1>
      </div>
      <FloorplanAssignmentManager events={events ?? []} />
    </div>
  );
}
