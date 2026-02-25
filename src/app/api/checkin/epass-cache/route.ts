import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signParticipantCode } from "@/lib/services/epass.service";

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
      person_id,
      registration_id,
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

  // Fetch participant codes for all tokens
  const admin = createAdminClient();
  const personIds = [...new Set((tokens ?? []).map((t: any) => t.person_id))];
  const registrationIds = [
    ...new Set((tokens ?? []).map((t: any) => t.registration_id)),
  ];

  const { data: memberships } = await admin
    .from("eckcm_group_memberships")
    .select("person_id, participant_code, eckcm_groups!inner(registration_id)")
    .in("person_id", personIds.length > 0 ? personIds : ["__none__"])
    .in(
      "eckcm_groups.registration_id",
      registrationIds.length > 0 ? registrationIds : ["__none__"]
    );

  // Build lookup: person_id:registration_id -> participant_code
  const codeMap = new Map<string, string>();
  for (const m of (memberships ?? []) as any[]) {
    const regId = m.eckcm_groups?.registration_id;
    if (regId) codeMap.set(`${m.person_id}:${regId}`, m.participant_code);
  }

  // Fetch HMAC secret for signing cached codes
  const { data: appConfig } = await admin
    .from("eckcm_app_config")
    .select("epass_hmac_secret")
    .eq("id", 1)
    .single();
  const hmacSecret = (appConfig as any)?.epass_hmac_secret as string | null;

  const mapped = (tokens ?? []).map((t: any) => {
    const code = codeMap.get(`${t.person_id}:${t.registration_id}`) ?? null;
    return {
      tokenHash: t.token_hash,
      participantCode: code,
      signedCode: code && hmacSecret ? signParticipantCode(code, hmacSecret) : code,
      personName: `${t.eckcm_people.first_name_en} ${t.eckcm_people.last_name_en}`,
      koreanName: t.eckcm_people.display_name_ko,
      confirmationCode: t.eckcm_registrations.confirmation_code,
      eventId,
      eventName: t.eckcm_registrations.eckcm_events.name_en,
      eventYear: t.eckcm_registrations.eckcm_events.year,
      isActive: t.is_active,
      registrationStatus: t.eckcm_registrations.status,
    };
  });

  return NextResponse.json({
    tokens: mapped,
    cachedAt: new Date().toISOString(),
  });
}
