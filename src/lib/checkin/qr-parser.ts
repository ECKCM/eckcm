export type ParsedQR =
  | { kind: "participantCode"; participantCode: string }
  | { kind: "token"; token: string };

const SIGNED_CODE_RE = /^[A-HJ-NP-Z2-9]{6}\.[a-f0-9]{8}$/;
const PLAIN_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const EPASS_URL_RE = /\/epass\/(?:[A-Za-z0-9]+_)?([A-Za-z0-9_-]{20,})/;
const LEGACY_TOKEN_RE = /^[A-Za-z0-9_-]{20,40}$/;

/**
 * Parse a raw scanned value into either a participant code (plain or HMAC-signed)
 * or a legacy epass token. Returns null when the value matches nothing recognized
 * so the caller can show an "invalid QR" warning.
 */
export function parseQRValue(scannedValue: string): ParsedQR | null {
  const trimmed = scannedValue.trim();
  if (!trimmed) return null;
  if (SIGNED_CODE_RE.test(trimmed)) return { kind: "participantCode", participantCode: trimmed };
  if (PLAIN_CODE_RE.test(trimmed)) return { kind: "participantCode", participantCode: trimmed };
  const urlMatch = trimmed.match(EPASS_URL_RE);
  if (urlMatch) return { kind: "token", token: urlMatch[1] };
  if (LEGACY_TOKEN_RE.test(trimmed)) return { kind: "token", token: trimmed };
  return null;
}

/** Stable dedupe key for a parsed value. */
export function dedupeKeyFor(parsed: ParsedQR): string {
  return parsed.kind === "participantCode" ? parsed.participantCode : parsed.token;
}

/** Returns the "verify body" partial — the shape the /api/checkin/verify route expects. */
export function toVerifyBody(parsed: ParsedQR): { participantCode?: string; token?: string } {
  return parsed.kind === "participantCode"
    ? { participantCode: parsed.participantCode }
    : { token: parsed.token };
}
