import { createClient } from "@/lib/supabase/server";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ChurchesManager } from "./churches-manager";

export default async function ChurchesPage() {
  const supabase = await createClient();

  const { data: churches } = await supabase
    .from("ECKCM_churches")
    .select("*")
    .order("is_other", { ascending: false })
    .order("sort_order");

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Churches</h1>
      </header>
      <div className="p-6">
        <ChurchesManager initialChurches={churches ?? []} />
      </div>
    </div>
  );
}
