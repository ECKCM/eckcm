import { createAdminClient } from "@/lib/supabase/admin";
import { generateEPassToken } from "@/lib/services/epass.service";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Ensure every given person has an E-Pass token for this registration and
 * return a `person_id -> token` map.
 *
 * Existing token rows are reused regardless of their active/inactive state, so
 * we never create duplicates and never disturb the activation lifecycle that
 * the approval/payment flows own. Persons with no token row at all get a freshly
 * generated active token — the recovery path for the rare case where token
 * insertion failed earlier (e.g. during payment confirmation).
 *
 * Goal: emails can always link to a public `/epass/{slug}` page (viewable by
 * non-members) instead of the members-only `/dashboard/epass` fallback.
 */
export async function ensureEPassTokens(
  admin: AdminClient,
  registrationId: string,
  personIds: string[],
): Promise<Map<string, string>> {
  const tokenMap = new Map<string, string>();
  const uniqueIds = [...new Set(personIds)];
  if (uniqueIds.length === 0) return tokenMap;

  const { data: existing, error } = await admin
    .from("eckcm_epass_tokens")
    .select("person_id, token")
    .eq("registration_id", registrationId)
    .in("person_id", uniqueIds);

  if (error) {
    console.error(
      `[ensureEPassTokens] Failed to load tokens for registration ${registrationId}:`,
      error,
    );
  }

  for (const t of existing ?? []) {
    if (t.token) tokenMap.set(t.person_id, t.token);
  }

  const missing = uniqueIds.filter((id) => !tokenMap.has(id));
  if (missing.length === 0) return tokenMap;

  console.warn(
    `[ensureEPassTokens] Registration ${registrationId} missing ${missing.length} token(s) — generating`,
  );
  const newTokens = missing.map((personId) => {
    const { token, tokenHash } = generateEPassToken();
    return {
      person_id: personId,
      registration_id: registrationId,
      token,
      token_hash: tokenHash,
      is_active: true,
    };
  });

  const { data: inserted, error: insertError } = await admin
    .from("eckcm_epass_tokens")
    .insert(newTokens)
    .select("person_id, token");

  if (insertError) {
    console.error(
      `[ensureEPassTokens] Failed to generate tokens for registration ${registrationId}:`,
      insertError,
    );
  } else {
    for (const t of inserted ?? []) {
      if (t.token) tokenMap.set(t.person_id, t.token);
    }
  }

  return tokenMap;
}

/**
 * Build the public E-Pass URL for a participant.
 *
 * Always prefer the direct, token-based `/epass/{slug}` link — it works for
 * anyone (member or not). The slug carries a name prefix so the viewer's
 * `extractTokenFromSlug` can split off the token (which may itself contain
 * underscores from base64url encoding).
 *
 * Only falls back to the members-only dashboard when no token could be obtained
 * at all, which should be vanishingly rare once {@link ensureEPassTokens} runs.
 */
export function buildEPassUrl(
  baseUrl: string,
  firstNameEn: string,
  lastNameEn: string,
  token: string | undefined,
): string {
  if (!token) return `${baseUrl}/dashboard/epass`;
  const namePrefix = `${firstNameEn}${lastNameEn}`.replace(/[^a-zA-Z0-9]/g, "");
  return `${baseUrl}/epass/${namePrefix}_${token}`;
}
