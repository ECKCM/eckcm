import { createClient } from "@/lib/supabase/server";
import { InvoicesTable } from "./invoices-table";

export default async function InvoicesPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("ECKCM_events")
    .select("id, name_en, year")
    .order("year", { ascending: false });

  return <InvoicesTable events={events ?? []} />;
}
