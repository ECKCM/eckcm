import { createHash, createHmac, randomUUID } from "crypto";

/**
 * Generate E-Pass token and its hash.
 * Token: first 32 chars of base64url-encoded UUID
 * Hash: SHA-256 of the token
 */
export function generateEPassToken(): { token: string; tokenHash: string } {
  const uuid = randomUUID();
  const token = Buffer.from(uuid.replace(/-/g, ""), "hex")
    .toString("base64url")
    .slice(0, 32);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

/**
 * Verify a token by comparing its hash
 */
export function verifyEPassToken(
  token: string,
  expectedHash: string
): boolean {
  const hash = createHash("sha256").update(token).digest("hex");
  return hash === expectedHash;
}

const HMAC_SIG_LENGTH = 8;

/**
 * Sign a participant code with HMAC-SHA256.
 * Returns "CODE.signature" format (e.g. "ABCD23.a1b2c3d4")
 */
export function signParticipantCode(code: string, secret: string): string {
  const sig = createHmac("sha256", secret)
    .update(code)
    .digest("hex")
    .slice(0, HMAC_SIG_LENGTH);
  return `${code}.${sig}`;
}

/**
 * Verify and extract participant code from signed string.
 * Input: "ABCD23.a1b2c3d4"
 * Returns { valid, participantCode }
 */
export function verifySignedCode(
  signed: string,
  secret: string
): { valid: boolean; participantCode: string } {
  const dotIdx = signed.lastIndexOf(".");
  if (dotIdx === -1) {
    return { valid: false, participantCode: signed };
  }

  const code = signed.slice(0, dotIdx);
  const sig = signed.slice(dotIdx + 1);

  const expectedSig = createHmac("sha256", secret)
    .update(code)
    .digest("hex")
    .slice(0, HMAC_SIG_LENGTH);

  // Timing-safe comparison
  const valid =
    sig.length === expectedSig.length &&
    createHash("sha256").update(sig).digest("hex") ===
      createHash("sha256").update(expectedSig).digest("hex");

  return { valid, participantCode: code };
}
