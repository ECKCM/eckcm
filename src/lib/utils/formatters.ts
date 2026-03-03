/**
 * Format cents to dollar string
 */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/**
 * Format date to locale string
 */
export function formatDate(
  date: string | Date,
  locale: string = "en-US"
): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

/**
 * K-12 cutoff date based on US school year Senior (12th grade) birthday rule.
 *
 * The US school year uses September 1 as the birthday cutoff:
 *   - Senior (12th grade) for school year ending in `eventYear`:
 *       born between Sep 1 (eventYear-18) and Aug 31 (eventYear-17)
 *   - K-12 = born on or after Sep 1 (eventYear-18)
 *   - Not K-12 = born on Aug 31 (eventYear-18) or earlier (graduated)
 *
 * Both boundary dates are computed dynamically so any future event year works:
 *   septemberFirst = new Date(cutoffYear, 8, 1)   → Sep 1  (month index 8)
 *   augustLast     = new Date(cutoffYear, 8, 0)   → Aug 31 (day 0 = last day of prev month)
 */
export function getK12CutoffDate(eventDate: Date): Date {
  const eventYear = eventDate.getFullYear();
  const cutoffYear = eventYear - 18;
  // First day of September in cutoffYear — anyone born on/after this is K-12
  return new Date(cutoffYear, 8, 1); // Sep 1 (month 8, 0-indexed)
}

export function isK12ByBirthDate(birthDate: Date, eventDate: Date): boolean {
  return birthDate >= getK12CutoffDate(eventDate);
}

/**
 * Format phone number for display (handles stored values with country codes)
 */
export function formatPhone(phone: string): string {
  if (!phone) return "";
  // Already formatted with country code prefix
  if (phone.startsWith("+82 ") || phone.startsWith("+1 ")) return phone;
  // Legacy: raw digits
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `+1 (${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}
