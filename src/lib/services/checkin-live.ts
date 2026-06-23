import { createHmac, timingSafeEqual } from "crypto";

// Public live check-in counts board.
//
// Shared with on-site / UPJ staff (and venue display screens) who have no admin
// login, so it lives behind an unguessable capability URL — the same model as
// e-pass and the UPJ lodging table. The token is DERIVED (not stored) from the
// existing `epass_hmac_secret` with a distinct message, so:
//   - nothing new to provision (rotating the secret rotates this link too), and
//   - it is a SEPARATE capability from the lodging link — holding one does not
//     grant the other.

const LIVE_TOKEN_MESSAGE = "checkin-live-v1";

/**
 * Derive the live-counts link token from a server secret. Returns null when no
 * secret is configured (the feature simply stays disabled rather than exposing
 * a guessable link).
 */
export function deriveLiveToken(secret: string | null | undefined): string | null {
  const s = secret || process.env.UPJ_LODGING_SECRET || null;
  if (!s) return null;
  return createHmac("sha256", s).update(LIVE_TOKEN_MESSAGE).digest("hex").slice(0, 40);
}

/** Constant-time comparison of a candidate token against the derived one. */
export function liveTokenMatches(
  candidate: string,
  secret: string | null | undefined,
): boolean {
  const expected = deriveLiveToken(secret);
  if (!expected || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
