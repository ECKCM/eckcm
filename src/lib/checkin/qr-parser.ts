export type ParsedQR =
  | { kind: "participantCode"; participantCode: string }
  | { kind: "token"; token: string };

// Participant codes use Crockford-ish base32 (no I/O/0/1) for the 6-char code,
// followed by an 8-char HMAC signature (hex). The signature regexes accept
// BOTH cases because USB/Bluetooth HID scanners frequently re-emit the QR text
// with the hex uppercased (or, on some keyboard layouts, drop the "." between
// the code and the signature entirely). We normalize back to the canonical
// "CODE.sighex" form (code upper, signature LOWER) so the server-side HMAC
// verify — which compares against a lowercase hex digest — still matches.
const CODE_BODY = "[A-HJ-NP-Z2-9]{6}";
const SIG_BODY = "[a-fA-F0-9]{8}";
const SIGNED_CODE_RE = new RegExp(`^(${CODE_BODY})\\.(${SIG_BODY})$`);
// Same as signed, but the reader dropped the dot → "CODE" + 8 hex glued together.
// 14 chars total, so it can never collide with the 20–40 char legacy token.
const SPLICED_CODE_RE = new RegExp(`^(${CODE_BODY})(${SIG_BODY})$`);
const PLAIN_CODE_RE = new RegExp(`^${CODE_BODY}$`);
const EPASS_URL_RE = /\/epass\/(?:[A-Za-z0-9]+_)?([A-Za-z0-9_-]{20,})/;
const LEGACY_TOKEN_RE = /^[A-Za-z0-9_-]{20,40}$/;

function signedParticipant(code: string, sig: string): ParsedQR {
  return {
    kind: "participantCode",
    participantCode: `${code.toUpperCase()}.${sig.toLowerCase()}`,
  };
}

/**
 * Parse a raw scanned value into either a participant code (plain or HMAC-signed)
 * or a legacy epass token. Returns null when the value matches nothing recognized
 * so the caller can show an "invalid QR" warning.
 *
 * Robust to HID-scanner mangling: collapses internal whitespace, is
 * case-insensitive for participant codes, accepts an uppercased signature, and
 * recovers a dot that the reader dropped. Legacy tokens stay case-sensitive
 * (they're opaque), so they're matched against the original text.
 */
export function parseQRValue(scannedValue: string): ParsedQR | null {
  // Some readers inject a stray space (often around the "."). Strip all
  // internal whitespace before matching.
  const cleaned = scannedValue.trim().replace(/\s+/g, "");
  if (!cleaned) return null;

  // URL first — tokens are case-sensitive, so test before any upper-casing.
  const urlMatch = cleaned.match(EPASS_URL_RE);
  if (urlMatch) return { kind: "token", token: urlMatch[1] };

  // Participant code (case-insensitive). Upper-case for matching the base32
  // body; signedParticipant re-normalizes case for both halves.
  const upper = cleaned.toUpperCase();
  const signed = upper.match(SIGNED_CODE_RE);
  if (signed) return signedParticipant(signed[1], signed[2]);
  const spliced = upper.match(SPLICED_CODE_RE);
  if (spliced) return signedParticipant(spliced[1], spliced[2]);
  if (PLAIN_CODE_RE.test(upper)) return { kind: "participantCode", participantCode: upper };

  // Legacy opaque token (case-sensitive) — match the original cleaned text.
  if (LEGACY_TOKEN_RE.test(cleaned)) return { kind: "token", token: cleaned };

  // LAST-RESORT recovery. The check-in desk is counting paid attendees who are
  // already through registration, so a scan must NEVER hard-reject just because
  // an IME (Korean "한국어" input mode) or a flaky reader corrupted a few
  // characters. Strip everything that can't belong to a participant-code QR and
  // see if a recoverable code falls out of what remains.
  //   - drop non-[A-Za-z0-9.] (Hangul jamo, control chars, stray punctuation)
  //   - then look for the "6 base32 + 8 hex" signed shape, dot optional
  const ascii = cleaned.replace(/[^A-Za-z0-9.]/g, "");
  if (ascii) {
    const recovered =
      ascii.toUpperCase().match(SIGNED_CODE_RE) ??
      ascii.toUpperCase().match(SPLICED_CODE_RE);
    if (recovered) return signedParticipant(recovered[1], recovered[2]);
    // Scan for a signed code embedded anywhere in the de-noised string.
    const embedded = ascii
      .toUpperCase()
      .match(/([A-HJ-NP-Z2-9]{6})\.?([A-Fa-f0-9]{8})/);
    if (embedded) return signedParticipant(embedded[1], embedded[2]);
    // Bare 6-char code surfaced after de-noising.
    const bare = ascii.toUpperCase().match(/[A-HJ-NP-Z2-9]{6}/);
    if (bare) return { kind: "participantCode", participantCode: bare[0] };
  }

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
