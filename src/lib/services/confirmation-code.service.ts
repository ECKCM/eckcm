import { containsProfanity } from "@/lib/utils/profanity-filter";
import { CONFIRMATION_CODE_CHARS } from "@/lib/utils/constants";

export function generateConfirmationCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code +=
      CONFIRMATION_CODE_CHARS[
        Math.floor(Math.random() * CONFIRMATION_CODE_CHARS.length)
      ];
  }
  return code;
}

export function generateSafeConfirmationCode(maxRetries = 10): string {
  for (let i = 0; i < maxRetries; i++) {
    const code = generateConfirmationCode();
    if (!containsProfanity(code)) {
      return code;
    }
  }
  // Fallback: return anyway after max retries
  return generateConfirmationCode();
}
