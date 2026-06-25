import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";
import { bulkMealPassSchema } from "@/lib/schemas/api";
import { writeAuditLog } from "@/lib/services/audit.service";
import {
  buildMealPassUrl,
  newMealPassToken,
} from "@/lib/services/meal-pass.service";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/meal-passes/bulk-generate
 *
 * Generates a batch of single-use ("일회용 / disposable") meal-pass QR codes for
 * printing at the registration desk, split by tier (e.g. General × 5 + Youth ×
 * 5). Each token is unique; one scan consumes the single use and the pass
 * becomes USED_UP. Access is gated by requireAdmin() — the /admin/print/qr-cards
 * page already requires the existing `print.qrcard` permission via middleware,
 * so no new permission code is introduced.
 */
export async function POST(request: Request) {
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bulkMealPassSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { general, youth, eventId, label } = parsed.data;
  const admin = createAdminClient();
  const batchId = randomUUID();

  // One row per pass, tagged with its tier so the desk can hand out the right
  // one and the meal line sees the category.
  const tierCounts: [string, number][] = [
    ["MEAL_GENERAL", general],
    ["MEAL_YOUTH", youth],
  ];
  const rows = tierCounts.flatMap(([tierCode, n]) =>
    Array.from({ length: n }, () => {
      const { token, tokenHash } = newMealPassToken();
      return {
        event_id: eventId ?? null,
        token,
        token_hash: tokenHash,
        tier_code: tierCode,
        uses_total: 1,
        uses_consumed: 0,
        amount_cents: 0,
        pass_kind: "COMP" as const,
        status: "ACTIVE" as const,
        batch_id: batchId,
        created_by_user_id: adminAuth.user.id,
        metadata: label ? { label } : {},
      };
    })
  );

  const { data: inserted, error } = await admin
    .from("eckcm_meal_passes")
    .insert(rows)
    .select("id, token, tier_code");

  if (error || !inserted) {
    logger.error("[meal-passes/bulk-generate] Failed to insert batch", {
      error: error?.message ?? "no data",
    });
    return NextResponse.json(
      { error: "Failed to generate meal passes" },
      { status: 500 }
    );
  }

  await writeAuditLog(admin, {
    event_id: eventId ?? null,
    user_id: adminAuth.user.id,
    action: "BULK_MEAL_PASSES_GENERATED",
    entity_type: "meal_pass_batch",
    entity_id: batchId,
    new_data: { general, youth, count: inserted.length, label: label ?? null },
  });

  return NextResponse.json({
    batchId,
    passes: inserted.map((p) => ({
      id: p.id,
      token: p.token,
      tierCode: p.tier_code as string | null,
      redeemUrl: buildMealPassUrl(p.token as string),
    })),
  });
}
