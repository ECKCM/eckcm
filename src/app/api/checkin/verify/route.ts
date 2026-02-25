import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "crypto";
import { verifySignedCode } from "@/lib/services/epass.service";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Verify admin/staff access
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { token, participantCode, checkinType = "MAIN", sessionId } = body;

  if (!token && !participantCode) {
    return NextResponse.json(
      { error: "token or participantCode is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Resolve participant code (handle HMAC-signed format: CODE.SIGNATURE)
  let resolvedParticipantCode = participantCode;
  if (participantCode && participantCode.includes(".")) {
    const { data: config } = await admin
      .from("eckcm_app_config")
      .select("epass_hmac_secret")
      .eq("id", 1)
      .single();
    const secret = (config as any)?.epass_hmac_secret as string | null;
    if (secret) {
      const { valid, participantCode: code } = verifySignedCode(participantCode, secret);
      if (!valid) {
        return NextResponse.json(
          { error: "Invalid QR signature" },
          { status: 403 }
        );
      }
      resolvedParticipantCode = code;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = null;

  if (resolvedParticipantCode) {
    // Look up by participant code through group_memberships
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
      .eq("participant_code", resolvedParticipantCode)
      .single();

    if (memberError || !membership) {
      return NextResponse.json(
        { error: "Invalid participant code" },
        { status: 404 }
      );
    }

    const m = membership as any;
    const reg = m.eckcm_groups.eckcm_registrations;

    // Check E-Pass is active
    const { data: epass } = await admin
      .from("eckcm_epass_tokens")
      .select("is_active")
      .eq("person_id", m.person_id)
      .eq("registration_id", m.eckcm_groups.registration_id)
      .single();

    data = {
      person_id: m.person_id,
      is_active: epass?.is_active ?? true,
      eckcm_people: m.eckcm_people,
      eckcm_registrations: {
        confirmation_code: reg.confirmation_code,
        status: reg.status,
        event_id: reg.event_id,
        eckcm_events: reg.eckcm_events,
      },
    };
  } else {
    // Look up by token hash (legacy/backwards-compatible)
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const { data: epass, error: epassError } = await supabase
      .from("eckcm_epass_tokens")
      .select(
        `
        id,
        person_id,
        registration_id,
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
      .eq("token_hash", tokenHash)
      .single();

    if (epassError || !epass) {
      return NextResponse.json(
        { error: "Invalid E-Pass token" },
        { status: 404 }
      );
    }

    data = epass as any;
  }

  if (!data.is_active) {
    return NextResponse.json(
      {
        error: "E-Pass is inactive",
        person: {
          name: `${data.eckcm_people.first_name_en} ${data.eckcm_people.last_name_en}`,
          koreanName: data.eckcm_people.display_name_ko,
        },
      },
      { status: 403 }
    );
  }

  if (data.eckcm_registrations.status !== "PAID") {
    return NextResponse.json(
      {
        error: "Registration is not paid",
        person: {
          name: `${data.eckcm_people.first_name_en} ${data.eckcm_people.last_name_en}`,
          koreanName: data.eckcm_people.display_name_ko,
        },
      },
      { status: 403 }
    );
  }

  // Record check-in
  const { error: checkinError } = await supabase
    .from("eckcm_checkins")
    .insert({
      person_id: data.person_id,
      event_id: data.eckcm_registrations.event_id,
      session_id: sessionId || null,
      checkin_type: checkinType,
      checked_in_by: user.id,
    });

  if (checkinError) {
    // Unique constraint violation = already checked in
    if (checkinError.code === "23505") {
      return NextResponse.json(
        {
          status: "already_checked_in",
          person: {
            name: `${data.eckcm_people.first_name_en} ${data.eckcm_people.last_name_en}`,
            koreanName: data.eckcm_people.display_name_ko,
          },
          event: {
            name: data.eckcm_registrations.eckcm_events.name_en,
            year: data.eckcm_registrations.eckcm_events.year,
          },
          confirmationCode: data.eckcm_registrations.confirmation_code,
        },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { error: "Failed to record check-in" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: "checked_in",
    person: {
      name: `${data.eckcm_people.first_name_en} ${data.eckcm_people.last_name_en}`,
      koreanName: data.eckcm_people.display_name_ko,
    },
    event: {
      name: data.eckcm_registrations.eckcm_events.name_en,
      year: data.eckcm_registrations.eckcm_events.year,
    },
    confirmationCode: data.eckcm_registrations.confirmation_code,
    checkinType,
  });
}
