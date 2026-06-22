import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCheckinStaff } from "@/lib/auth/admin";
import type { ScanSessionKind } from "@/lib/types/checkin";

const VALID_KINDS: ScanSessionKind[] = [
  "MAIN_CHECKIN",
  "CHECKOUT",
  "MEAL_BREAKFAST",
  "MEAL_LUNCH",
  "MEAL_DINNER",
  "SESSION",
  "OTHER",
];

interface CreateBody {
  eventId: string;
  kind: ScanSessionKind;
  label?: string;
  mealDate?: string;
  sessionId?: string;
  isSandbox?: boolean;
}

/**
 * POST /api/scan-sessions — start a new scan session.
 *
 * Body: { eventId, kind, label?, mealDate?, sessionId?, isSandbox? }
 *
 * For meal kinds, `mealDate` should be provided so the session can be filtered
 * later. For SESSION kind, `sessionId` should reference an eckcm_sessions row.
 * Caller is recorded as `started_by`.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminAuth = await requireCheckinStaff();
  if (!adminAuth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as CreateBody;
  const { eventId, kind, label, mealDate, sessionId, isSandbox } = body;

  if (!eventId || !kind) {
    return NextResponse.json(
      { error: "eventId and kind are required" },
      { status: 400 }
    );
  }
  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (kind.startsWith("MEAL_") && !mealDate) {
    return NextResponse.json(
      { error: "mealDate is required for meal scan sessions" },
      { status: 400 }
    );
  }
  if (kind === "SESSION" && !sessionId) {
    return NextResponse.json(
      { error: "sessionId is required for SESSION scan sessions" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eckcm_scan_sessions")
    .insert({
      event_id: eventId,
      kind,
      label: label ?? null,
      meal_date: mealDate ?? null,
      session_id: sessionId ?? null,
      is_sandbox: !!isSandbox,
      started_by: user.id,
      status: "ACTIVE",
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create scan session" },
      { status: 500 }
    );
  }

  return NextResponse.json({ scanSession: data }, { status: 201 });
}

/**
 * GET /api/scan-sessions — list scan sessions.
 *
 * Query params:
 *   eventId   — filter by event (required)
 *   status    — filter by status (ACTIVE/PAUSED/ENDED), or omit for all
 *   kind      — filter by kind
 *   limit     — default 50
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminAuth = await requireCheckinStaff();
  if (!adminAuth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  const status = searchParams.get("status");
  const kind = searchParams.get("kind");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  let q = admin
    .from("eckcm_scan_sessions")
    .select("*")
    .eq("event_id", eventId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (status) q = q.eq("status", status);
  if (kind) q = q.eq("kind", kind);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scanSessions: data ?? [] });
}
