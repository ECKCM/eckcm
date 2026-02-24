import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = req.nextUrl.searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  // 1. Total paid registrations
  const { count: totalRegistrations } = await supabase
    .from("eckcm_registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "PAID");

  // 2. Total registered people (via groups -> memberships)
  const { data: peopleData } = await supabase
    .from("eckcm_group_memberships")
    .select("id, eckcm_groups!inner(event_id)")
    .eq("eckcm_groups.event_id", eventId)
    .eq("status", "ACTIVE");

  const totalPeople = peopleData?.length ?? 0;

  // 3. All checkins
  const { data: checkins } = await supabase
    .from("eckcm_checkins")
    .select("id, person_id, checkin_type, checked_in_at")
    .eq("event_id", eventId);

  const allCheckins = checkins ?? [];

  const mainCheckins = allCheckins.filter((c) => c.checkin_type === "MAIN");
  const diningCheckins = allCheckins.filter((c) => c.checkin_type === "DINING");
  const sessionCheckins = allCheckins.filter((c) => c.checkin_type === "SESSION");

  // 4. Unique people checked in (MAIN) for arrival rate
  const uniqueMainPersonIds = new Set(mainCheckins.map((c) => c.person_id));

  // 5. Hourly distribution (today)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayCheckins = allCheckins.filter(
    (c) => new Date(c.checked_in_at) >= todayStart
  );

  const hourlyDistribution: Record<string, number> = {};
  for (const c of todayCheckins) {
    const hour = new Date(c.checked_in_at).getHours();
    const key = `${String(hour).padStart(2, "0")}:00`;
    hourlyDistribution[key] = (hourlyDistribution[key] ?? 0) + 1;
  }

  // 6. Last 24h by type
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCheckins = allCheckins.filter(
    (c) => new Date(c.checked_in_at) >= oneDayAgo
  );

  const last24h = { MAIN: 0, DINING: 0, SESSION: 0 };
  for (const c of recentCheckins) {
    const t = c.checkin_type as keyof typeof last24h;
    if (t in last24h) last24h[t]++;
  }

  return NextResponse.json({
    totalRegistrations: totalRegistrations ?? 0,
    totalPeople,
    checkins: {
      total: allCheckins.length,
      main: mainCheckins.length,
      dining: diningCheckins.length,
      session: sessionCheckins.length,
    },
    arrivalRate: {
      checkedIn: uniqueMainPersonIds.size,
      total: totalPeople,
      percentage:
        totalPeople > 0
          ? Math.round((uniqueMainPersonIds.size / totalPeople) * 100)
          : 0,
    },
    hourlyDistribution,
    last24h,
  });
}
