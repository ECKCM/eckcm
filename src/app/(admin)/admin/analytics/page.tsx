import { createClient } from "@/lib/supabase/server";
import { AnalyticsView } from "@/components/admin/analytics-view";

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year, is_active, is_default")
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Analytics</h1>
      </div>
      <div className="p-4 sm:p-6">
        {events && events.length > 0 ? (
          <AnalyticsView events={events} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No events yet. Create an event to see analytics.
          </p>
        )}
      </div>
    </div>
  );
}
