import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// Always run fresh — never let this be statically cached, or it would stop
// touching the database and defeat the whole purpose.
export const dynamic = "force-dynamic";

/**
 * Cron job: keep the Supabase project from auto-pausing on the Free tier.
 *
 * Supabase Free pauses a project after 7 consecutive days with NO database
 * activity. Once the event is over there may be days with zero real traffic,
 * so this runs a trivial query to register "activity" and keep the project
 * awake (so E-Pass / admin lookups never hit a paused database).
 *
 * Trigger it from an EXTERNAL scheduler (GitHub Actions — see
 * .github/workflows/supabase-keep-alive.yml). Vercel Cron on the Hobby plan is
 * not reliable enough (≤1/day, not guaranteed) to count on for this.
 *
 * Secured via CRON_SECRET (same scheme as the other cron routes).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Cheapest possible touch: read a single row from a tiny config table.
  // `head: true` fetches no rows, only the count — minimal data transfer while
  // still being a real query the database has to serve.
  const { error } = await admin
    .from("eckcm_app_config")
    .select("id", { count: "exact", head: true });

  if (error) {
    logger.error("[cron/keep-alive] Supabase ping failed", { error: String(error) });
    return NextResponse.json({ ok: false, error: "ping failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() });
}
