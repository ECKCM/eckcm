import { createClient } from "@/lib/supabase/server";
import { ChurchGroups } from "./church-groups";

export default async function ChurchGroupsPage() {
  const supabase = await createClient();

  const [{ data: events }, { data: feeCategories }] = await Promise.all([
    supabase
      .from("eckcm_events")
      .select("id, name_en, year")
      .order("is_default", { ascending: false })
      .order("year", { ascending: false }),
    supabase
      .from("eckcm_fee_categories")
      .select("code, name_en")
      .eq("category", "LODGING")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)]">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Church Groups</h1>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <ChurchGroups events={events ?? []} feeCategories={feeCategories ?? []} />
      </div>
    </div>
  );
}
