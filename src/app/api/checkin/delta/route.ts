import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json(
      { error: "Missing eventId parameter" },
      { status: 400 }
    );
  }

  let query = supabase
    .from("eckcm_checkins")
    .select("id, person_id, event_id, session_id, checkin_type, checked_in_at")
    .eq("event_id", eventId)
    .order("checked_in_at", { ascending: false })
    .limit(500);

  if (since) {
    query = query.gt("checked_in_at", since);
  }

  const { data: checkins, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch delta" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    checkins: checkins ?? [],
    serverTime: new Date().toISOString(),
  });
}
