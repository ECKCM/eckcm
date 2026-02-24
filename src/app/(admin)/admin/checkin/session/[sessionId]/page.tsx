import { createClient } from "@/lib/supabase/server";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { notFound } from "next/navigation";
import { SessionDashboardClient } from "./session-dashboard-client";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("eckcm_sessions")
    .select("id, event_id, name_en, name_ko, session_date, start_time, end_time, is_active")
    .eq("id", sessionId)
    .single();

  if (!session) notFound();

  // Get check-in stats for this session
  const { count: checkinCount } = await supabase
    .from("eckcm_checkins")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("checkin_type", "SESSION");

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">
          Session: {session.name_en}
        </h1>
      </header>
      <div className="p-6">
        <SessionDashboardClient
          session={session}
          initialCheckinCount={checkinCount ?? 0}
        />
      </div>
    </div>
  );
}
