import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCheckinStaff } from "@/lib/auth/admin";
import type { ScanSessionStatus } from "@/lib/types/checkin";

type Action = "pause" | "resume" | "end";

const ALLOWED_TRANSITIONS: Record<Action, ScanSessionStatus[]> = {
  pause: ["ACTIVE"],
  resume: ["PAUSED"],
  end: ["ACTIVE", "PAUSED"],
};

const NEXT_STATUS: Record<Action, ScanSessionStatus> = {
  pause: "PAUSED",
  resume: "ACTIVE",
  end: "ENDED",
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
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

  const { id } = await ctx.params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eckcm_scan_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Scan session not found" }, { status: 404 });
  }

  return NextResponse.json({ scanSession: data });
}

/**
 * PATCH /api/scan-sessions/[id] — pause / resume / end.
 *
 * Body: { action: "pause" | "resume" | "end" }
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
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

  const { id } = await ctx.params;
  const body = (await req.json()) as { action?: Action };
  const action = body.action;
  if (!action || !(action in ALLOWED_TRANSITIONS)) {
    return NextResponse.json(
      { error: "action must be one of: pause, resume, end" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: current, error: fetchError } = await admin
    .from("eckcm_scan_sessions")
    .select("status")
    .eq("id", id)
    .single();

  if (fetchError || !current) {
    return NextResponse.json({ error: "Scan session not found" }, { status: 404 });
  }

  const currentStatus = (current as { status: ScanSessionStatus }).status;
  if (!ALLOWED_TRANSITIONS[action].includes(currentStatus)) {
    return NextResponse.json(
      {
        error: `Cannot ${action} a session in status ${currentStatus}`,
      },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: NEXT_STATUS[action] };
  if (action === "pause") {
    patch.paused_at = now;
  }
  if (action === "resume") {
    patch.paused_at = null;
  }
  if (action === "end") {
    patch.ended_at = now;
    patch.ended_by = user.id;
  }

  const { data: updated, error: updateError } = await admin
    .from("eckcm_scan_sessions")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "Failed to update scan session" },
      { status: 500 }
    );
  }

  return NextResponse.json({ scanSession: updated });
}
