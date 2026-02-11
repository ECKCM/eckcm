// Profanity filter for confirmation codes
// Blocks offensive substrings in generated codes
const BLOCKED_SUBSTRINGS = [
  // English
  "FUK",
  "FUC",
  "FCK",
  "SHT",
  "ASS",
  "SEX",
  "DIK",
  "DIC",
  "COK",
  "CUM",
  "FAG",
  "GAY",
  "JEW",
  "NIG",
  "WTF",
  "STF",
  "SUK",
  "SUC",
  "TIT",
  "VAG",
  "PNS",
  "BIT",
  "HOR",
  "SLU",
  "DAM",
  "HEL",
  "GOD",
  "DIE",
  "KIL",
  "GUN",
  // Korean romanized
  "SSI",
  "BAL",
  "SIB",
  "JOT",
];

/**
 * Check if a code contains blocked substrings
 */
export function containsProfanity(code: string): boolean {
  const upper = code.toUpperCase();
  return BLOCKED_SUBSTRINGS.some((word) => upper.includes(word));
}
