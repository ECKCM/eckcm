import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import {
  resolveParticipant,
  computeMealCategory,
  type ResolvedParticipant,
} from "@/lib/services/participant-lookup";

function toPersonPayload(p: ResolvedParticipant) {
  return {
    id: p.personId,
    name: p.legalName,
    koreanName: p.koreanName,
    participantCode: p.participantCode,
    gender: p.gender,
    birthDate: p.birthDate,
    mealCategory: computeMealCategory(p.birthDate, p.event.startDate),
    isEpassActive: p.isEpassActive,
  };
}

function toEventPayload(p: ResolvedParticipant) {
  return {
    id: p.event.id,
    name: p.event.name,
    year: p.event.year,
    startDate: p.event.startDate,
  };
}

function toRegistrationPayload(p: ResolvedParticipant) {
  return {
    id: p.registration.id,
    confirmationCode: p.registration.confirmationCode,
    status: p.registration.status,
  };
}

// The total-count query that used to live here was removed for speed —
// every scan added ~50-150ms of latency for a number the client already
// has via the realtime hook (recentCheckins.length). If a surface ever
// needs a server-authoritative count again, fetch it via /api/checkin/recent.

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
  const {
    token,
    participantCode,
    checkinType = "MAIN",
    sessionId,
    mealDate,
    mealType,
    scanSessionId,
  } = body;

  if (!token && !participantCode) {
    return NextResponse.json(
      { error: "token or participantCode is required" },
      { status: 400 }
    );
  }

  // Enforce scan-session lifecycle if one was supplied.
  let scanSessionIsSandbox = false;
  if (scanSessionId) {
    const adminForSession = createAdminClient();
    const { data: scanSession, error: scanSessionError } = await adminForSession
      .from("eckcm_scan_sessions")
      .select("id, status, is_sandbox")
      .eq("id", scanSessionId)
      .single();

    if (scanSessionError || !scanSession) {
      return NextResponse.json(
        { error: "Scan session not found" },
        { status: 404 }
      );
    }
    const ss = scanSession as { id: string; status: string; is_sandbox: boolean };
    if (ss.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `Scan session is ${ss.status.toLowerCase()}` },
        { status: 409 }
      );
    }
    scanSessionIsSandbox = ss.is_sandbox;
  }

  if (checkinType === "DINING") {
    if (!mealDate || !mealType) {
      return NextResponse.json(
        { error: "mealDate and mealType are required for DINING check-in" },
        { status: 400 }
      );
    }
    if (!["BREAKFAST", "LUNCH", "DINNER"].includes(mealType)) {
      return NextResponse.json(
        { error: "mealType must be BREAKFAST, LUNCH, or DINNER" },
        { status: 400 }
      );
    }
  }

  const admin = createAdminClient();

  let hmacSecret: string | null = null;
  if (participantCode && participantCode.includes(".")) {
    const { data: config } = await admin
      .from("eckcm_app_config")
      .select("epass_hmac_secret")
      .eq("id", 1)
      .single();
    hmacSecret = (config as unknown as { epass_hmac_secret: string | null } | null)?.epass_hmac_secret ?? null;
  }

  const resolution = await resolveParticipant(admin, {
    token,
    participantCode,
    hmacSecret,
  });

  if (!resolution.ok) {
    const statusByCode: Record<string, number> = {
      missing_input: 400,
      invalid_signature: 403,
      not_found: 404,
    };
    return NextResponse.json(
      { error: resolution.error.message },
      { status: statusByCode[resolution.error.code] ?? 400 }
    );
  }

  const p = resolution.participant;

  if (!p.isEpassActive) {
    return NextResponse.json(
      {
        error: "E-Pass is inactive",
        person: toPersonPayload(p),
        registration: toRegistrationPayload(p),
        event: toEventPayload(p),
      },
      { status: 403 }
    );
  }

  if (p.registration.status !== "PAID" && p.registration.status !== "APPROVED") {
    return NextResponse.json(
      {
        error: "Registration is not paid",
        person: toPersonPayload(p),
        registration: toRegistrationPayload(p),
        event: toEventPayload(p),
      },
      { status: 403 }
    );
  }

  const personPayload = toPersonPayload(p);
  const registrationPayload = toRegistrationPayload(p);
  const eventPayload = toEventPayload(p);

  // Sandbox scans are persisted (tagged is_sandbox=true) so they appear in
  // the Scan Sessions historical viewer. The partial unique indexes exclude
  // is_sandbox rows so they never collide with real check-ins.
  const insertData: Record<string, unknown> = {
    person_id: p.personId,
    event_id: p.event.id,
    session_id: sessionId || null,
    scan_session_id: scanSessionId || null,
    checkin_type: checkinType,
    checked_in_by: user.id,
    is_sandbox: scanSessionIsSandbox,
  };
  if (checkinType === "DINING") {
    insertData.meal_date = mealDate;
    insertData.meal_type = mealType;
  }

  const { error: checkinError } = await admin
    .from("eckcm_checkins")
    .insert(insertData);

  if (checkinError) {
    if (checkinError.code === "23505") {
      return NextResponse.json({
        status: "already_checked_in",
        person: personPayload,
        registration: registrationPayload,
        event: eventPayload,
        confirmationCode: p.registration.confirmationCode,
        checkinType,
        isSandbox: scanSessionIsSandbox,
      });
    }
    return NextResponse.json(
      { error: "Failed to record check-in" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: "checked_in",
    person: personPayload,
    registration: registrationPayload,
    event: eventPayload,
    confirmationCode: p.registration.confirmationCode,
    checkinType,
    isSandbox: scanSessionIsSandbox,
  });
}
