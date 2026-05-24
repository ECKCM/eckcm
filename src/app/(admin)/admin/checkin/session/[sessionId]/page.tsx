import { createClient } from "@/lib/supabase/server";
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
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">
          Session: {session.name_en}
        </h1>
      </div>
      <div className="p-6">
        <SessionDashboardClient
          session={session}
          initialCheckinCount={checkinCount ?? 0}
        />
      </div>
    </div>
  );
}
