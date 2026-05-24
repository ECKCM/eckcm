import { createClient } from "@/lib/supabase/server";
import { InvoicesTable } from "./invoices-table";

export default async function InvoicesPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year")
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Invoices</h1>
      </div>
      <div className="p-6">
        <InvoicesTable events={events ?? []} />
      </div>
    </div>
  );
}
