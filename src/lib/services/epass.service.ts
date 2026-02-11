import { createHash, randomUUID } from "crypto";

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
