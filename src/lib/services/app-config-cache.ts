import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * In-process cache for hot-path values read out of `eckcm_app_config`.
 *
 * Vercel Fluid Compute reuses function instances across invocations, so a
 * module-scope cache survives between requests on the same warm container.
 * For the check-in scanner this turns the per-scan "fetch the HMAC secret"
 * round-trip into a free memory read on every scan after the first one.
 *
 * The TTL bounds staleness if an admin rotates the secret from
 * Settings → Configuration; the rotation endpoint also calls
 * `invalidateAppConfigCache()` so warm containers see the new value
 * immediately rather than waiting up to TTL.
 */

const TTL_MS = 5 * 60 * 1000;

let hmacCache: { value: string | null; expiresAt: number } | null = null;

export async function getHmacSecret(
  client: SupabaseClient
): Promise<string | null> {
  const now = Date.now();
  if (hmacCache && hmacCache.expiresAt > now) {
    return hmacCache.value;
  }
  const { data } = await client
    .from("eckcm_app_config")
    .select("epass_hmac_secret")
    .eq("id", 1)
    .single();
  const value =
    (data as { epass_hmac_secret: string | null } | null)
      ?.epass_hmac_secret ?? null;
  hmacCache = { value, expiresAt: now + TTL_MS };
  return value;
}

export function invalidateAppConfigCache(): void {
  hmacCache = null;
}
