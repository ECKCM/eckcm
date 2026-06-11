import type { SupabaseClient } from "@supabase/supabase-js";
import { generateSafeConfirmationCode } from "@/lib/services/confirmation-code.service";
import { logger } from "@/lib/logger";

/**
 * Robust participant_code resolution for E-Pass QR rendering.
 *
 * Every E-Pass surface (public /epass/{slug}, dashboard list/detail, check-in
 * legacy-token lookup) needs the participant_code behind a (person_id,
 * registration_id) pair to draw the QR. The naive `.maybeSingle()` lookup used
 * to fail silently in three real-world cases, making the QR disappear with no
 * trace:
 *   1. duplicate membership rows for the same person in one registration
 *      (maybeSingle errors on >1 row and the error was discarded)
 *   2. membership rows whose participant_code is NULL (legacy data)
 *   3. transient query errors
 *
 * This service tolerates duplicates, self-heals NULL codes by assigning a
 * fresh unique code (same scheme as registration submit / transfer), and logs
 * loudly whenever a QR cannot be produced so the failure is visible in
 * production logs.
 */

export interface MembershipCodeRow {
  id: string;
  participant_code: string | null;
  status: string | null;
  created_at: string | null;
}

/**
 * Pick the membership row whose code should back the QR.
 * Preference: has a code > ACTIVE status > most recently created.
 * Pure function so the ranking is unit-testable.
 */
export function pickBestMembership<T extends MembershipCodeRow>(
  rows: T[],
): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const aHasCode = a.participant_code ? 0 : 1;
    const bHasCode = b.participant_code ? 0 : 1;
    if (aHasCode !== bHasCode) return aHasCode - bHasCode;
    const aActive = a.status === "ACTIVE" ? 0 : 1;
    const bActive = b.status === "ACTIVE" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  })[0];
}

/**
 * Assign a fresh unique participant_code to a membership that has none.
 * participant_code is a global check-in lookup key, so candidates are checked
 * for uniqueness first (same convention as submit/transfer routes). The update
 * is guarded with `.is("participant_code", null)` so a concurrent heal can
 * never overwrite an existing code; the row is re-read afterwards to return
 * whichever code actually won.
 */
export async function assignParticipantCode(
  admin: SupabaseClient,
  membershipId: string,
): Promise<string | null> {
  const candidates: string[] = [];
  for (let i = 0; i < 12; i++) candidates.push(generateSafeConfirmationCode());

  const { data: existing } = await admin
    .from("eckcm_group_memberships")
    .select("participant_code")
    .in("participant_code", candidates);
  const used = new Set(
    ((existing ?? []) as { participant_code: string }[]).map(
      (c) => c.participant_code,
    ),
  );
  const code = candidates.find((c) => !used.has(c));
  if (!code) {
    logger.error("[participant-code] No unused code candidate found", {
      membershipId,
    });
    return null;
  }

  const { error: updateError } = await admin
    .from("eckcm_group_memberships")
    .update({ participant_code: code })
    .eq("id", membershipId)
    .is("participant_code", null);

  if (updateError) {
    logger.error("[participant-code] Failed to assign participant_code", {
      membershipId,
      error: String(updateError),
    });
    return null;
  }

  const { data: row } = await admin
    .from("eckcm_group_memberships")
    .select("participant_code")
    .eq("id", membershipId)
    .single();

  const assigned =
    (row as { participant_code: string | null } | null)?.participant_code ??
    null;
  if (assigned) {
    logger.warn("[participant-code] Self-healed missing participant_code", {
      membershipId,
      code: assigned,
    });
  }
  return assigned;
}

/**
 * Resolve the participant_code backing a person's E-Pass in one registration.
 * Never throws. Returns null only when the person has no membership in the
 * registration at all (e.g. they were removed) or the database is unreachable
 * — and logs an error either way so missing QRs show up in production logs.
 */
export async function resolveParticipantCode(
  admin: SupabaseClient,
  personId: string,
  registrationId: string,
  opts: { heal?: boolean } = {},
): Promise<string | null> {
  const heal = opts.heal ?? true;

  const { data, error } = await admin
    .from("eckcm_group_memberships")
    .select(
      "id, participant_code, status, created_at, eckcm_groups!inner(registration_id)",
    )
    .eq("person_id", personId)
    .eq("eckcm_groups.registration_id", registrationId);

  if (error) {
    logger.error("[participant-code] Membership lookup failed", {
      personId,
      registrationId,
      error: String(error),
    });
    return null;
  }

  const rows = (data ?? []) as unknown as MembershipCodeRow[];
  const best = pickBestMembership(rows);

  if (!best) {
    logger.error("[participant-code] No membership found for E-Pass", {
      personId,
      registrationId,
    });
    return null;
  }

  if (best.participant_code) return best.participant_code;
  if (!heal) return null;
  return assignParticipantCode(admin, best.id);
}
