import { createClient } from "@/lib/supabase/server";
import { GuardianConsentsTable } from "./guardian-consents-table";

export default async function GuardianConsentsPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year")
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Guardian Consents</h1>
      </div>
      <div className="p-6">
        <GuardianConsentsTable events={events ?? []} />
      </div>
    </div>
  );
}
