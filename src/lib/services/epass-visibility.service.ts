import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/**
 * Which E-Passes a logged-in user is allowed to see on /dashboard/epass
 * (list + detail).
 *
 * The naive rule "registration.created_by_user_id = user.id" silently hid every
 * E-Pass for a TRANSFERRED participant. A transfer (clone model) moves the
 * person into a DIFFERENT registration — often created by a different user —
 * and the new e-pass token is bound to that target registration, so the
 * original registrant no longer matched and the pass vanished from their
 * dashboard.
 *
 * Visibility is therefore expressed as TWO things, NOT a flat registration list:
 *
 *   1. ownRegistrationIds — registrations the user created. EVERY pass in these
 *      is visible (self + everyone they registered), exactly as before.
 *
 *   2. extraPairs — specific (person_id, registration_id) pairs reachable via a
 *      transfer that touched one of the user's registrations. We follow the
 *      SPECIFIC PERSON to the other side, NOT the whole counterpart
 *      registration. Pulling the whole registration was the bug behind
 *      "useless strangers got added": the target registration usually contains
 *      other people the user has nothing to do with. Following only the
 *      transferred person keeps the list to "people I registered, wherever they
 *      ended up".
 *
 * A token is visible iff its registration is in ownRegistrationIds OR its
 * (person, registration) is in extraPairs — see `isTokenVisible`.
 *
 * Membership stays the source of truth for an individual token: the page still
 * drops any token whose (person, registration) pair has no membership, so the
 * stale token left in the source registration is not resurfaced — only the live
 * token where the person now belongs.
 *
 * Never throws. On error it logs and degrades to just the user's own
 * registrations (or empty), never erroring the page.
 */
export interface PersonRegPair {
  person_id: string;
  registration_id: string;
}

export interface EPassVisibility {
  ownRegistrationIds: string[];
  extraPairs: PersonRegPair[];
}

export async function getEPassVisibility(
  admin: SupabaseClient,
  userId: string,
): Promise<EPassVisibility> {
  const empty: EPassVisibility = { ownRegistrationIds: [], extraPairs: [] };

  // 1. Registrations the user created directly.
  const { data: ownReg, error: ownErr } = await admin
    .from("eckcm_registrations")
    .select("id")
    .eq("created_by_user_id", userId);

  if (ownErr) {
    logger.error("[epass-visibility] Failed to load own registrations", {
      userId,
      error: String(ownErr),
    });
    return empty;
  }

  const ownRegistrationIds = ((ownReg ?? []) as { id: string }[]).map(
    (r) => r.id,
  );
  if (ownRegistrationIds.length === 0) return empty;

  // A single user creates very few registrations (prod: max 21, avg ~1.5), so
  // this id list is tiny and the PostgREST .or(.in()) below is nowhere near the
  // URL-length limit that bites large event-wide id lists. No chunking needed.

  // 2. Transfers that touched one of those registrations. Follow the specific
  //    person to the OTHER side only.
  //      - user's reg is the SOURCE → person moved OUT → show them in to_reg
  //      - user's reg is the TARGET → person moved IN  → also show their pair in
  //        from_reg (the origin), so a receiving registrant can still see where
  //        they came from. (Origin token is usually a deactivated ghost with no
  //        membership and gets filtered, but including the pair is harmless and
  //        symmetric.)
  const inList = ownRegistrationIds.join(",");
  const { data: transfers, error: trErr } = await admin
    .from("eckcm_participant_transfers")
    .select("person_id, from_registration_id, to_registration_id")
    .or(`from_registration_id.in.(${inList}),to_registration_id.in.(${inList})`);

  if (trErr) {
    logger.error("[epass-visibility] Failed to load transfers", {
      userId,
      error: String(trErr),
    });
    // Non-fatal: still show the user's own registrations' passes.
    return { ownRegistrationIds, extraPairs: [] };
  }

  const ownSet = new Set(ownRegistrationIds);
  const seen = new Set<string>();
  const extraPairs: PersonRegPair[] = [];
  const addPair = (person_id: string | null, registration_id: string | null) => {
    if (!person_id || !registration_id) return;
    // Don't duplicate pairs already covered by ownRegistrationIds.
    if (ownSet.has(registration_id)) return;
    const key = `${person_id}:${registration_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    extraPairs.push({ person_id, registration_id });
  };

  for (const t of (transfers ?? []) as {
    person_id: string | null;
    from_registration_id: string | null;
    to_registration_id: string | null;
  }[]) {
    const fromOwned = t.from_registration_id
      ? ownSet.has(t.from_registration_id)
      : false;
    const toOwned = t.to_registration_id
      ? ownSet.has(t.to_registration_id)
      : false;
    // Person left one of my regs → follow them into the target.
    if (fromOwned) addPair(t.person_id, t.to_registration_id);
    // Person arrived into one of my regs → also expose their origin pair.
    if (toOwned) addPair(t.person_id, t.from_registration_id);
  }

  return { ownRegistrationIds, extraPairs };
}

/**
 * The flat set of registration ids that must be fetched to satisfy a
 * visibility result — own registrations plus every registration referenced by
 * an extra pair. Used to scope the token query's `.in("registration_id", …)`.
 * (The per-token check `isTokenVisible` then trims pulled-in strangers.)
 */
export function visibilityRegistrationIds(v: EPassVisibility): string[] {
  const ids = new Set(v.ownRegistrationIds);
  for (const p of v.extraPairs) ids.add(p.registration_id);
  return [...ids];
}

/**
 * Whether a specific token (by person + registration) is visible under a
 * visibility result: its registration is fully owned, OR its exact
 * (person, registration) pair was reached via a transfer.
 */
export function isTokenVisible(
  v: EPassVisibility,
  personId: string,
  registrationId: string,
): boolean {
  if (v.ownRegistrationIds.includes(registrationId)) return true;
  return v.extraPairs.some(
    (p) => p.person_id === personId && p.registration_id === registrationId,
  );
}
