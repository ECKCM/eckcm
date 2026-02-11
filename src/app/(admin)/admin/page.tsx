import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("ECKCM_events")
    .select("id, name_en, year, is_active")
    .order("year", { ascending: false });

  const activeEvents = events?.filter((e) => e.is_active) ?? [];

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Admin Dashboard</h1>
      </header>
      <div className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{events?.length ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{activeEvents.length}</p>
            </CardContent>
          </Card>
        </div>

        {activeEvents.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Active Events</h2>
            <div className="grid gap-3">
              {activeEvents.map((event) => (
                <Card key={event.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">{event.name_en}</p>
                      <p className="text-sm text-muted-foreground">
                        {event.year}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
