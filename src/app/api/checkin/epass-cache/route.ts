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
    return NextResponse.json(
      { error: "eventId is required" },
      { status: 400 }
    );
  }

  const { data: tokens, error } = await supabase
    .from("eckcm_epass_tokens")
    .select(
      `
      token_hash,
      is_active,
      eckcm_people!inner(first_name_en, last_name_en, display_name_ko),
      eckcm_registrations!inner(
        confirmation_code,
        status,
        event_id,
        eckcm_events!inner(name_en, year)
      )
    `
    )
    .eq("eckcm_registrations.event_id", eventId)
    .eq("is_active", true);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch E-Pass data" },
      { status: 500 }
    );
  }

  const mapped = (tokens ?? []).map((t: any) => ({
    tokenHash: t.token_hash,
    personName: `${t.eckcm_people.first_name_en} ${t.eckcm_people.last_name_en}`,
    koreanName: t.eckcm_people.display_name_ko,
    confirmationCode: t.eckcm_registrations.confirmation_code,
    eventId,
    eventName: t.eckcm_registrations.eckcm_events.name_en,
    eventYear: t.eckcm_registrations.eckcm_events.year,
    isActive: t.is_active,
    registrationStatus: t.eckcm_registrations.status,
  }));

  return NextResponse.json({
    tokens: mapped,
    cachedAt: new Date().toISOString(),
  });
}
