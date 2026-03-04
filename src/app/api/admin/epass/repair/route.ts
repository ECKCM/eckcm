import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { generateEPassToken } from "@/lib/services/epass.service";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/epass/repair
 * Finds PAID registrations with missing e-pass tokens and generates them.
 * Optionally scoped to a specific registrationId or eventId.
 *
 * Body: { registrationId?: string, eventId?: string }
 * - If neither provided: scans all PAID registrations
 * - If registrationId: repairs that single registration
 * - If eventId: repairs all PAID registrations for that event
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { registrationId, eventId } = body as {
    registrationId?: string;
    eventId?: string;
  };

  const admin = createAdminClient();

  // 1. Find target PAID registrations
  let query = admin
    .from("eckcm_registrations")
    .select("id, confirmation_code, event_id")
    .eq("status", "PAID");

  if (registrationId) {
    query = query.eq("id", registrationId);
  } else if (eventId) {
    query = query.eq("event_id", eventId);
  }

  const { data: registrations, error: regError } = await query;

  if (regError) {
    logger.error("[epass/repair] Failed to load registrations", { error: String(regError) });
    return NextResponse.json({ error: "Failed to load registrations" }, { status: 500 });
  }

  if (!registrations || registrations.length === 0) {
    return NextResponse.json({ repaired: 0, details: [] });
  }

  const results = await Promise.all(
    registrations.map(async (reg) => {
      // 2. Load memberships + existing tokens in parallel
      const [{ data: memberships }, { data: existingTokens }] = await Promise.all([
        admin
          .from("eckcm_group_memberships")
          .select("person_id, eckcm_groups!inner(registration_id)")
          .eq("eckcm_groups.registration_id", reg.id),
        admin
          .from("eckcm_epass_tokens")
          .select("person_id")
          .eq("registration_id", reg.id)
          .eq("is_active", true),
      ]);

      if (!memberships || memberships.length === 0) return null;

      const personIds = memberships.map((m) => m.person_id);
      const existingSet = new Set((existingTokens ?? []).map((t) => t.person_id));
      const missingIds = personIds.filter((id) => !existingSet.has(id));

      if (missingIds.length === 0) return null;

      // 3. Activate any existing inactive tokens first
      await admin
        .from("eckcm_epass_tokens")
        .update({ is_active: true })
        .eq("registration_id", reg.id)
        .eq("is_active", false)
        .in("person_id", missingIds);

      // Re-check after activation
      const { data: nowActive } = await admin
        .from("eckcm_epass_tokens")
        .select("person_id")
        .eq("registration_id", reg.id)
        .eq("is_active", true)
        .in("person_id", missingIds);

      const nowActiveSet = new Set((nowActive ?? []).map((t) => t.person_id));
      const stillMissing = missingIds.filter((id) => !nowActiveSet.has(id));

      // 4. Generate new tokens for still-missing participants
      if (stillMissing.length > 0) {
        const newTokens = stillMissing.map((personId) => {
          const { token, tokenHash } = generateEPassToken();
          return {
            person_id: personId,
            registration_id: reg.id,
            token,
            token_hash: tokenHash,
            is_active: true,
          };
        });

        const { error: insertError } = await admin
          .from("eckcm_epass_tokens")
          .insert(newTokens);

        if (insertError) {
          logger.error("[epass/repair] Failed to insert tokens", {
            registrationId: reg.id,
            error: String(insertError),
          });
          return null;
        }
      }

      const generated = missingIds.length;
      logger.info("[epass/repair] Repaired tokens", {
        registrationId: reg.id,
        confirmationCode: reg.confirmation_code,
        tokensGenerated: generated,
      });
      return { registrationId: reg.id, confirmationCode: reg.confirmation_code, tokensGenerated: generated };
    })
  );

  const details = results.filter((r): r is NonNullable<typeof r> => r !== null);
  const totalGenerated = details.reduce((sum, d) => sum + d.tokensGenerated, 0);

  return NextResponse.json({
    repaired: details.length,
    totalTokensGenerated: totalGenerated,
    details,
  });
}

/**
 * GET /api/admin/epass/repair?eventId=xxx
 * Returns PAID registrations that are missing e-pass tokens (for audit/preview).
 */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");

  const admin = createAdminClient();

  let query = admin
    .from("eckcm_registrations")
    .select("id, confirmation_code, event_id")
    .eq("status", "PAID");

  if (eventId) {
    query = query.eq("event_id", eventId);
  }

  const { data: registrations, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to load registrations" }, { status: 500 });
  }

  const missing: { registrationId: string; confirmationCode: string; missingCount: number }[] = [];

  await Promise.all(
    (registrations ?? []).map(async (reg) => {
      const [{ count: memberCount }, { count: tokenCount }] = await Promise.all([
        admin
          .from("eckcm_group_memberships")
          .select("person_id, eckcm_groups!inner(registration_id)", { count: "exact", head: true })
          .eq("eckcm_groups.registration_id", reg.id),
        admin
          .from("eckcm_epass_tokens")
          .select("person_id", { count: "exact", head: true })
          .eq("registration_id", reg.id)
          .eq("is_active", true),
      ]);
      const mc = memberCount ?? 0;
      const tc = tokenCount ?? 0;
      if (mc > tc) {
        missing.push({
          registrationId: reg.id,
          confirmationCode: reg.confirmation_code,
          missingCount: mc - tc,
        });
      }
    })
  );

  return NextResponse.json({ missing, total: missing.length });
}
