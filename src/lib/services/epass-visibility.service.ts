import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/**
 * Which registrations' E-Passes a logged-in user is allowed to see on
 * /dashboard/epass (list + detail).
 *
 * The naive rule "registration.created_by_user_id = user.id" silently hid every
 * E-Pass for a TRANSFERRED participant. A transfer (clone model) moves the
 * person into a DIFFERENT registration — typically created by a different user
 * — and the new e-pass token is bound to that target registration. So the
 * original registrant, who initiated the transfer, no longer matches the
 * token's registration creator and the pass vanished from their dashboard.
 * (Verified in prod: most transfers are cross-user.)
 *
 * The fix widens visibility from "registrations I created" to that set UNION
 * "the other side of any transfer that touched a registration I created". That
 * way BOTH the original registrant and the current owner can see the
 * transferred person. The per-pass "not yours → dimmed" treatment is unchanged
 * and still driven by person-identity matching in the page, so widening the
 * registration set only affects which passes APPEAR, not which look owned.
 *
 * Membership remains the source of truth for an individual token: the page
 * still drops any token whose (person, registration) pair has no membership, so
 * the stale token left behind in the source registration is NOT resurfaced —
 * only the live token in the registration the person now belongs to.
 *
 * Never throws. On a query error it logs and falls back to just the
 * directly-created registrations (or [] if even that fails), degrading to the
 * old, safe behavior rather than exposing nothing or erroring the page.
 */
export async function getVisibleRegistrationIds(
  admin: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const ids = new Set<string>();

  // 1. Registrations the user created directly (the original rule).
  const { data: ownReg, error: ownErr } = await admin
    .from("eckcm_registrations")
    .select("id")
    .eq("created_by_user_id", userId);

  if (ownErr) {
    logger.error("[epass-visibility] Failed to load own registrations", {
      userId,
      error: String(ownErr),
    });
    // Can't establish any baseline — safest is to show nothing.
    return [];
  }

  for (const r of (ownReg ?? []) as { id: string }[]) ids.add(r.id);

  if (ids.size === 0) return [];

  // A single user creates very few registrations (prod: max 21, avg ~1.5), so
  // this id list is tiny and the PostgREST .or(.in()) below is nowhere near the
  // URL-length limit that bites large event-wide id lists. No chunking needed.
  const ownIds = [...ids];

  // 2. The other side of every transfer that touched one of those
  //    registrations — whether the user's registration was the source
  //    (person moved OUT) or the target (person moved IN). Both directions are
  //    included so the original registrant keeps visibility after sending a
  //    participant away, and a receiving registrant gains it.
  const { data: transfers, error: trErr } = await admin
    .from("eckcm_participant_transfers")
    .select("from_registration_id, to_registration_id")
    .or(
      `from_registration_id.in.(${ownIds.join(",")}),to_registration_id.in.(${ownIds.join(",")})`,
    );

  if (trErr) {
    // Non-fatal: the user still sees their own registrations' passes. A
    // transferred participant may stay hidden, but that's strictly better than
    // erroring the whole page, and it's logged for follow-up.
    logger.error("[epass-visibility] Failed to load transfers", {
      userId,
      error: String(trErr),
    });
    return ownIds;
  }

  for (const t of (transfers ?? []) as {
    from_registration_id: string | null;
    to_registration_id: string | null;
  }[]) {
    if (t.from_registration_id) ids.add(t.from_registration_id);
    if (t.to_registration_id) ids.add(t.to_registration_id);
  }

  return [...ids];
}
