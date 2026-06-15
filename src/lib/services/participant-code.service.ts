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
  // `status` is intentionally NOT used for ranking — it is mutable and would
  // make the chosen code (and therefore the QR) change when a row flips
  // ACTIVE↔REMOVED. Kept on the type only because callers select it.
  status: string | null;
  created_at: string | null;
}

/**
 * Pick the membership row whose code should back the QR — DETERMINISTICALLY.
 *
 * The QR must be PERMANENT: the same (person, registration) must resolve to
 * the same participant_code on every surface and on every render. So the
 * ranking uses only IMMUTABLE attributes and never mutable ones:
 *
 *   1. has a code   — a NULL code can't back a QR. This is monotonic (a code
 *      is only ever assigned, never cleared), so it can never flip the chosen
 *      row away once one has a code.
 *   2. oldest created_at — the ORIGINAL membership. Its code is the one that
 *      was emailed in the confirmation and printed on the first badges, so it
 *      is the canonical permanent code. Choosing the oldest also means a newer
 *      duplicate row (from a recovery / re-add / manual op) can NEVER displace
 *      it, so the QR cannot drift when extra rows appear later.
 *   3. smallest id  — final tiebreak so the result is fully deterministic even
 *      when created_at ties or is missing.
 *
 * Earlier versions ranked by ACTIVE-status then most-recent created_at. Both
 * are mutable, so a status flip or a freshly-inserted duplicate row silently
 * changed which code won and the participant's QR changed under them. That is
 * exactly the bug this ordering removes. Pure function so it is unit-testable.
 */
export function pickBestMembership<T extends MembershipCodeRow>(
  rows: T[],
): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const aHasCode = a.participant_code ? 0 : 1;
    const bHasCode = b.participant_code ? 0 : 1;
    if (aHasCode !== bHasCode) return aHasCode - bHasCode;
    // Oldest first. A missing created_at sorts last (sentinel "￿" is
    // greater than any real ISO timestamp) so a known timestamp always wins.
    const aTime = a.created_at ?? "￿";
    const bTime = b.created_at ?? "￿";
    if (aTime !== bTime) return aTime < bTime ? -1 : 1;
    // Fully deterministic final tiebreak on the immutable row id.
    const aId = a.id ?? "";
    const bId = b.id ?? "";
    if (aId !== bId) return aId < bId ? -1 : 1;
    return 0;
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
