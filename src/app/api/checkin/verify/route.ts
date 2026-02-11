import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createHash } from "crypto";

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
  const { token, checkinType = "MAIN", sessionId } = body;

  if (!token) {
    return NextResponse.json(
      { error: "Token is required" },
      { status: 400 }
    );
  }

  // Look up E-Pass by token hash
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = epass as any;

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
