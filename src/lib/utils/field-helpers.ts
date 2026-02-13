/**
 * Shared field formatting, filtering, and validation helpers.
 * Used by: ProfileForm (signup), Participants page (leader & member).
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

/** Format raw input into (XXX) XXX-XXXX */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** True if empty or exactly 10 digits */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 0 || digits.length === 10;
}

/** True if phone has at least 1 digit but fewer than 10 (incomplete) */
export function isPhoneIncomplete(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 0 && digits.length < 10;
}

// ── Email ─────────────────────────────────────────────────────────────

/** True if empty or valid email format */
export function isValidEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
