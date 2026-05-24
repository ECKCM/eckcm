import { createClient } from "@/lib/supabase/server";
import { ChurchesManager } from "./churches-manager";

export default async function ChurchesPage() {
  const supabase = await createClient();

  const { data: churches } = await supabase
    .from("eckcm_churches")
    .select("*")
    .order("is_other", { ascending: false })
    .order("name_en");

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Churches</h1>
      </div>
      <div className="p-6">
        <ChurchesManager initialChurches={churches ?? []} />
      </div>
    </div>
  );
}
