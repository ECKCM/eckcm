/**
 * Shared field formatting, filtering, and validation helpers.
 * Used by: ProfileForm (signup), Participants page (representative & member).
 * IMPORTANT: Keep these in sync — all person-entry forms must behave identically.
 */

// ── Name ──────────────────────────────────────────────────────────────

/** Uppercase English/Spanish name pattern */
export const NAME_PATTERN = /^[A-ZÀ-ÖØ-ÝÑ]+(?: [A-ZÀ-ÖØ-ÝÑ]+)*$/;

/**
 * Filter & format a name input value:
 * - Convert to uppercase
 * - Strip non-letter, non-space chars
 * - No leading spaces
 * - Collapse consecutive spaces
 */
export function filterName(raw: string): string {
  let v = raw.toUpperCase();
  v = v.replace(/[^A-ZÀ-ÖØ-ÝÑ ]/g, "");
  v = v.replace(/^\s+/, "");
  v = v.replace(/\s{2,}/g, " ");
  return v;
}

/** Build display name from first + last */
export function buildDisplayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

// ── Phone ─────────────────────────────────────────────────────────────

/** Country code → expected digit count */
const COUNTRY_DIGITS: Record<string, number> = { US: 10, CA: 10, KR: 11 };

/** Dial code lookup */
const DIAL_CODES: Record<string, string> = { US: "+1", CA: "+1", KR: "+82" };

/** Format raw input into (XXX) XXX-XXXX — kept for backward compat */
export function formatPhone(raw: string): string {
  return formatPhoneNational(raw, "US");
}

/** Format national number based on country code */
export function formatPhoneNational(raw: string, countryCode: string): string {
  if (countryCode === "OTHER") return raw;
  if (countryCode === "KR") {
    const digits = raw.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  // US / CA
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Build stored phone value with dial code prefix: "+1 (212) 555-1234" */
export function buildPhoneValue(countryCode: string, nationalNumber: string): string {
  if (countryCode === "OTHER") return nationalNumber || "";
  const dial = DIAL_CODES[countryCode] ?? "+1";
  const digits = nationalNumber.replace(/\D/g, "");
  if (!digits) return "";
  return `${dial} ${nationalNumber}`;
}

/** Strip the dial-code prefix from a stored phone value to get the national number.
 *  Handles accumulated duplicates like "+1 +1 +1 (951) 966-1889". */
export function stripDialCode(stored: string, countryCode: string): string {
  if (!stored || countryCode === "OTHER") return stored || "";
  const dial = DIAL_CODES[countryCode];
  if (!dial) return stored;
  let result = stored;
  while (result.startsWith(dial + " ")) {
    result = result.slice(dial.length + 1);
  }
  return result;
}

/** True if empty or matches expected digit count for country */
export function isValidPhone(phone: string, countryCode: string = "US"): boolean {
  if (countryCode === "OTHER") return true;
  const digits = phone.replace(/\D/g, "");
  const expected = COUNTRY_DIGITS[countryCode] ?? 10;
  return digits.length === 0 || digits.length === expected;
}

/** True if phone has at least 1 digit but fewer than expected */
export function isPhoneIncomplete(phone: string, countryCode: string = "US"): boolean {
  if (countryCode === "OTHER") return false;
  const digits = phone.replace(/\D/g, "");
  const expected = COUNTRY_DIGITS[countryCode] ?? 10;
  return digits.length > 0 && digits.length < expected;
}

// ── Email ─────────────────────────────────────────────────────────────

/** True if empty or valid email format */
export function isValidEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
