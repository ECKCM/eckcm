import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCheckinStaff } from "@/lib/auth/admin";
import { mealPassRedeemSchema } from "@/lib/schemas/api";
import { logger } from "@/lib/logger";

/**
 * Redeem one use of a disposable meal pass at the food line. Gated by
 * requireCheckinStaff() (same operators as the meal kiosk). The pass grants N
 * generic uses (any meal, any day), so the concurrency guard is an optimistic
 * compare-and-set on uses_consumed — NOT a per-meal unique index (the same pass
 * may legitimately be used for three dinners).
 */
export async function POST(request: Request) {
  const auth = await requireCheckinStaff();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = mealPassRedeemSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { token, mealDate, mealType, scanSessionId } = parsed.data;
  const admin = createAdminClient();

  // Enforce scan-session lifecycle when one is supplied (mirrors verify route).
  let isSandbox = false;
  let sessionEventId: string | null = null;
  if (scanSessionId) {
    const { data: ss } = await admin
      .from("eckcm_scan_sessions")
      .select("id, status, is_sandbox, event_id")
      .eq("id", scanSessionId)
      .single();
    if (!ss) {
      return NextResponse.json({ error: "Scan session not found" }, { status: 404 });
    }
    if (ss.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `Scan session is ${String(ss.status).toLowerCase()}` },
        { status: 409 }
      );
    }
    isSandbox = ss.is_sandbox;
    sessionEventId = (ss as { event_id: string | null }).event_id ?? null;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { data: pass } = await admin
    .from("eckcm_meal_passes")
    .select(
      "id, event_id, status, uses_total, uses_consumed, payer_name, tier_code, pass_kind"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!pass) {
    return NextResponse.json({ error: "Meal pass not found" }, { status: 404 });
  }

  const passInfo = {
    payerName: pass.payer_name as string | null,
    tier: pass.tier_code as string | null,
    usesTotal: pass.uses_total as number,
    usesRemaining: Math.max(0, (pass.uses_total as number) - (pass.uses_consumed as number)),
    passKind: pass.pass_kind as string,
  };

  // Lifecycle gate. Servable = ACTIVE only (paid card / approved on-site / comp).
  //   USED_UP — every use already consumed
  //   VOID    — admin-invalidated / refunded
  //   PENDING — card payment not completed
  // Only an ACTIVE pass with uses left is servable.
  if (pass.status === "USED_UP" || passInfo.usesRemaining <= 0) {
    return NextResponse.json({ status: "used_up", mealPass: { ...passInfo, usesRemaining: 0 } });
  }
  if (pass.status === "VOID") {
    return NextResponse.json({ status: "error", error: "Pass is void", mealPass: passInfo });
  }
  if (pass.status === "SUBMITTED") {
    return NextResponse.json({ status: "error", error: "Awaiting admin approval", mealPass: passInfo });
  }
  if (pass.status !== "ACTIVE") {
    return NextResponse.json({ status: "error", error: "Pass is not active", mealPass: passInfo });
  }

  // Optimistic compare-and-set: only the scan that reads the current
  // uses_consumed AND writes consumed+1 wins. A concurrent scan that read the
  // same value fails the `.eq("uses_consumed", current)` predicate (0 rows) and
  // retries once against the fresh value. Prevents over-redemption past
  // uses_total without a DB function.
  let consumed = pass.uses_consumed as number;
  const total = pass.uses_total as number;
  let won = false;
  for (let attempt = 0; attempt < 2 && !won; attempt++) {
    if (consumed >= total) {
      return NextResponse.json({ status: "used_up", mealPass: { ...passInfo, usesRemaining: 0 } });
    }
    const next = consumed + 1;
    const { data: updated } = await admin
      .from("eckcm_meal_passes")
      .update({
        uses_consumed: next,
        status: next >= total ? "USED_UP" : pass.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pass.id)
      .eq("uses_consumed", consumed)
      .select("uses_consumed")
      .maybeSingle();

    if (updated) {
      won = true;
      consumed = next;
    } else {
      // Lost the race — re-read and try once more.
      const { data: fresh } = await admin
        .from("eckcm_meal_passes")
        .select("uses_consumed")
        .eq("id", pass.id)
        .single();
      consumed = (fresh?.uses_consumed as number) ?? total;
    }
  }

  if (!won) {
    return NextResponse.json({ status: "used_up", mealPass: { ...passInfo, usesRemaining: 0 } });
  }

  // Record the redemption (audit ledger). A failure here does not un-consume the
  // use — but we log it so the discrepancy is traceable.
  const { error: redErr } = await admin.from("eckcm_meal_pass_redemptions").insert({
    meal_pass_id: pass.id,
    // Disposable (qr-cards) passes carry no event, so attribute the redemption
    // to the scan session's event — that's the meal line it was served on, and
    // it's what /api/checkin/meal-stats filters by to fold it into the count.
    event_id: sessionEventId ?? pass.event_id,
    meal_date: mealDate,
    meal_type: mealType,
    scan_session_id: scanSessionId || null,
    redeemed_by: auth.user.id,
    is_sandbox: isSandbox,
  });
  if (redErr) {
    logger.error("[mealpass/redeem] Failed to record redemption", {
      mealPassId: pass.id,
      error: redErr.message,
    });
  }

  return NextResponse.json({
    status: "checked_in",
    mealDate,
    mealType,
    isSandbox,
    mealPass: { ...passInfo, usesRemaining: Math.max(0, total - consumed) },
  });
}
