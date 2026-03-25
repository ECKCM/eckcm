import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { createHash } from "crypto";
import { verifySignedCode } from "@/lib/services/epass.service";

interface MembershipJoined {
  person_id: string;
  participant_code: string;
  eckcm_groups: {
    registration_id: string;
    eckcm_registrations: {
      confirmation_code: string;
      status: string;
      event_id: string;
      eckcm_events: { name_en: string; year: number };
    };
  };
  eckcm_people: { first_name_en: string; last_name_en: string; display_name_ko: string | null };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { token, participantCode } = body;

  if (!token && !participantCode) {
    return NextResponse.json(
      { error: "token or participantCode is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Resolve person and event from participant code or token
  let personId: string | null = null;
  let eventId: string | null = null;
  let personName = "Unknown";
  let koreanName: string | null = null;
  let confirmationCode: string | null = null;
  let eventName: string | null = null;
  let eventYear: number | null = null;

  if (participantCode) {
    let resolvedCode = participantCode;
    if (participantCode.includes(".")) {
      const { data: config } = await admin
        .from("eckcm_app_config")
        .select("epass_hmac_secret")
        .eq("id", 1)
        .single();
      const secret = (config as unknown as { epass_hmac_secret: string | null } | null)?.epass_hmac_secret ?? null;
      if (secret) {
        const { valid, participantCode: code } = verifySignedCode(participantCode, secret);
        if (!valid) {
          return NextResponse.json({ error: "Invalid QR signature" }, { status: 403 });
        }
        resolvedCode = code;
      }
    }

    const { data: membership, error: memberError } = await admin
      .from("eckcm_group_memberships")
      .select(`
        person_id,
        participant_code,
        eckcm_groups!inner(
          registration_id,
          eckcm_registrations!inner(
            confirmation_code,
            status,
            event_id,
            eckcm_events!inner(name_en, year)
          )
        ),
        eckcm_people!inner(first_name_en, last_name_en, display_name_ko)
      `)
      .eq("participant_code", resolvedCode)
      .single();

    if (memberError || !membership) {
      return NextResponse.json({ error: "Invalid participant code" }, { status: 404 });
    }

    const m = membership as unknown as MembershipJoined;
    const reg = m.eckcm_groups.eckcm_registrations;
    personId = m.person_id;
    eventId = reg.event_id;
    personName = `${m.eckcm_people.first_name_en} ${m.eckcm_people.last_name_en}`;
    koreanName = m.eckcm_people.display_name_ko;
    confirmationCode = reg.confirmation_code;
    eventName = reg.eckcm_events.name_en;
    eventYear = reg.eckcm_events.year;
  } else {
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const { data: epass, error: epassError } = await supabase
      .from("eckcm_epass_tokens")
      .select(`
        person_id,
        eckcm_people!inner(first_name_en, last_name_en, display_name_ko),
        eckcm_registrations!inner(
          confirmation_code,
          status,
          event_id,
          eckcm_events!inner(name_en, year)
        )
      `)
      .eq("token_hash", tokenHash)
      .single();

    if (epassError || !epass) {
      return NextResponse.json({ error: "Invalid E-Pass token" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = epass as any;
    personId = d.person_id;
    eventId = d.eckcm_registrations.event_id;
    personName = `${d.eckcm_people.first_name_en} ${d.eckcm_people.last_name_en}`;
    koreanName = d.eckcm_people.display_name_ko;
    confirmationCode = d.eckcm_registrations.confirmation_code;
    eventName = d.eckcm_registrations.eckcm_events.name_en;
    eventYear = d.eckcm_registrations.eckcm_events.year;
  }

  // Find the existing MAIN check-in record
  const { data: existingCheckin, error: findError } = await admin
    .from("eckcm_checkins")
    .select("id, checked_in_at, checked_out_at")
    .eq("person_id", personId)
    .eq("event_id", eventId)
    .eq("checkin_type", "MAIN")
    .single();

  if (findError || !existingCheckin) {
    return NextResponse.json(
      {
        status: "error",
        error: "Not checked in yet",
        person: { name: personName, koreanName },
      },
      { status: 404 }
    );
  }

  if (existingCheckin.checked_out_at) {
    return NextResponse.json({
      status: "already_checked_out",
      person: { name: personName, koreanName },
      event: { name: eventName, year: eventYear },
      confirmationCode,
      checkedInAt: existingCheckin.checked_in_at,
      checkedOutAt: existingCheckin.checked_out_at,
    });
  }

  // Record checkout
  const { error: updateError } = await admin
    .from("eckcm_checkins")
    .update({
      checked_out_at: new Date().toISOString(),
      checked_out_by: user.id,
    })
    .eq("id", existingCheckin.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to record checkout" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: "checked_out",
    person: { name: personName, koreanName },
    event: { name: eventName, year: eventYear },
    confirmationCode,
    checkedInAt: existingCheckin.checked_in_at,
    checkedOutAt: new Date().toISOString(),
  });
}
