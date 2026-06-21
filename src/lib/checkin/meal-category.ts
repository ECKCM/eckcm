/**
 * Derive the meal tier from a person's birth date relative to an event's
 * start date. Mirrors the server-side `computeMealCategory` in
 * `lib/services/participant-lookup.ts` byte-for-byte so the kiosk's
 * offline simulation reports the same General / Youth / Free tally a real
 * verify would.
 *
 *   age >= 11  → adult ("General")
 *   age >=  5  → youth
 *   else       → free (under 5, no meal billed)
 *
 * Lives in its own file so client code can import it without dragging the
 * supabase admin client that `participant-lookup.ts` pulls in.
 */
export function computeMealCategory(
  birthDate: string | null,
  eventStartDate: string | null
): "adult" | "youth" | "free" | null {
  if (!birthDate || !eventStartDate) return null;
  const birth = new Date(birthDate);
  const ref = new Date(eventStartDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  if (age >= 11) return "adult";
  if (age >= 5) return "youth";
  return "free";
}
