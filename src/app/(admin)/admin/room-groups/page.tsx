import { createClient } from "@/lib/supabase/server";
import { RoomAssignment } from "./room-assignment";

export default async function RoomAssignmentPage() {
  const supabase = await createClient();

  const [{ data: events }, { data: feeCategories }] = await Promise.all([
    supabase
      .from("eckcm_events")
      .select("id, name_en, year")
      .order("is_default", { ascending: false })
      .order("year", { ascending: false }),
    supabase
      .from("eckcm_fee_categories")
      .select("id, code, name_en")
      .eq("category", "LODGING")
      .eq("is_inventory_trackable", true)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)]">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Room Assignment</h1>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <RoomAssignment
          events={events ?? []}
          feeCategories={feeCategories ?? []}
        />
      </div>
    </div>
  );
}
