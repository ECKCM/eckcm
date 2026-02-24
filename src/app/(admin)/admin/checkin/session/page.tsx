import { createClient } from "@/lib/supabase/server";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { SessionListClient } from "./session-list-client";

export default async function SessionCheckinPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  const activeEventId = events?.[0]?.id;

  let sessions: {
    id: string;
    name_en: string;
    name_ko: string | null;
    session_date: string;
    start_time: string | null;
    end_time: string | null;
    is_active: boolean;
  }[] = [];

  if (activeEventId) {
    const { data } = await supabase
      .from("eckcm_sessions")
      .select("id, name_en, name_ko, session_date, start_time, end_time, is_active")
      .eq("event_id", activeEventId)
      .order("session_date", { ascending: true });
    sessions = data ?? [];
  }

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Session Check-in</h1>
      </header>
      <div className="p-6">
        <SessionListClient events={events ?? []} initialSessions={sessions} />
      </div>
    </div>
  );
}
