import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { liveTokenMatches } from "@/lib/services/checkin-live";

/**
 * GET /api/live/[token] — public live counts for currently ACTIVE scan sessions.
 *
 * Capability-URL gated (no login) — the token is derived from the e-pass HMAC
 * secret (see lib/services/checkin-live). Returns aggregate counts only (no PII)
 * so it is safe to display on a venue screen or share with off-site staff.
 *
 * For each active, non-sandbox scan session it returns that session's running
 * count plus, for meal sessions, the whole-meal total across every session
 * (event + meal_date + meal_type) so a meal split across kiosks still shows one
 * authoritative headcount.
 */

export const dynamic = "force-dynamic";

const KIND_TO_MEAL_TYPE: Record<string, string> = {
  MEAL_BREAKFAST: "BREAKFAST",
  MEAL_LUNCH: "LUNCH",
  MEAL_DINNER: "DINNER",
};

interface SessionRow {
  id: string;
  label: string | null;
  kind: string;
  meal_date: string | null;
  event_id: string;
  started_at: string;
  is_sandbox: boolean;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: cfg } = await admin
    .from("eckcm_app_config")
    .select("epass_hmac_secret")
    .eq("id", 1)
    .single();
  const secret = (cfg as { epass_hmac_secret?: string | null } | null)
    ?.epass_hmac_secret;

  if (!liveTokenMatches(decodeURIComponent(token), secret)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Every ACTIVE scan session — including sandbox (simulation) ones, which are
  // surfaced but clearly badged so a test scan can be watched live without ever
  // being mistaken for, or folded into, the real meal headcount.
  const { data: sessionsRaw, error: sErr } = await admin
    .from("eckcm_scan_sessions")
    .select("id, label, kind, meal_date, event_id, started_at, is_sandbox")
    .eq("status", "ACTIVE")
    .order("started_at", { ascending: true });

  if (sErr) {
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }
  const sessions = (sessionsRaw ?? []) as SessionRow[];

  if (sessions.length === 0) {
    return NextResponse.json(
      { generatedAt: new Date().toISOString(), sessions: [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const sessionIds = sessions.map((s) => s.id);
  const eventIds = [...new Set(sessions.map((s) => s.event_id))];
  const mealDates = [
    ...new Set(sessions.map((s) => s.meal_date).filter(Boolean) as string[]),
  ];
  const mealTypes = [
    ...new Set(
      sessions
        .map((s) => KIND_TO_MEAL_TYPE[s.kind])
        .filter(Boolean) as string[]
    ),
  ];

  // Page size for the count queries below — a busy meal can exceed PostgREST's
  // default 1000-row cap, so an un-paged select would silently undercount.
  const PAGE = 1000;

  // Per-session running count (every check-in type). No is_sandbox filter here:
  // a session's rows all share its own sandbox flag (real session → real rows,
  // sandbox session → sandbox rows), so counting by scan_session_id is correct
  // for both and lets a live simulation show its own tally.
  const perSession = new Map<string, number>();
  for (let offset = 0; ; offset += PAGE) {
    const { data: rows } = await admin
      .from("eckcm_checkins")
      .select("scan_session_id")
      .in("scan_session_id", sessionIds)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    const batch = (rows ?? []) as { scan_session_id: string | null }[];
    for (const r of batch) {
      if (r.scan_session_id) {
        perSession.set(
          r.scan_session_id,
          (perSession.get(r.scan_session_id) ?? 0) + 1
        );
      }
    }
    if (batch.length < PAGE) break;
  }

  // Whole-meal totals for the meals currently being scanned (across ALL
  // sessions, including ended ones). Over-fetches the event×date×type cross
  // product, then tallies the exact tuple in JS — both lists are tiny.
  const mealTotal = new Map<string, number>();
  if (mealDates.length && mealTypes.length) {
    for (let offset = 0; ; offset += PAGE) {
      const { data: rows } = await admin
        .from("eckcm_checkins")
        .select("event_id, meal_date, meal_type")
        .eq("checkin_type", "DINING")
        .eq("is_sandbox", false)
        .in("event_id", eventIds)
        .in("meal_date", mealDates)
        .in("meal_type", mealTypes)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      const batch = (rows ?? []) as {
        event_id: string;
        meal_date: string | null;
        meal_type: string | null;
      }[];
      for (const r of batch) {
        const key = `${r.event_id}|${r.meal_date}|${r.meal_type}`;
        mealTotal.set(key, (mealTotal.get(key) ?? 0) + 1);
      }
      if (batch.length < PAGE) break;
    }
  }

  const { data: evs } = await admin
    .from("eckcm_events")
    .select("id, name_en, year")
    .in("id", eventIds);
  const eventName = new Map<string, string>(
    ((evs ?? []) as { id: string; name_en: string; year: number }[]).map((e) => [
      e.id,
      `${e.name_en} (${e.year})`,
    ])
  );

  const out = sessions.map((s) => {
    const mealType = KIND_TO_MEAL_TYPE[s.kind] ?? null;
    const mealKey = `${s.event_id}|${s.meal_date}|${mealType}`;
    return {
      id: s.id,
      label: s.label,
      kind: s.kind,
      mealType,
      mealDate: s.meal_date,
      startedAt: s.started_at,
      eventName: eventName.get(s.event_id) ?? "",
      isSandbox: s.is_sandbox,
      sessionCount: perSession.get(s.id) ?? 0,
      // Real meal totals exclude sandbox, so never show one against a sim
      // session (it would be the unrelated real count, or 0).
      mealTotal: !s.is_sandbox && mealType ? mealTotal.get(mealKey) ?? 0 : null,
    };
  });

  return NextResponse.json(
    { generatedAt: new Date().toISOString(), sessions: out },
    { headers: { "Cache-Control": "no-store" } }
  );
}
