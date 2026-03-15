import { describe, it, expect } from "vitest";
import {
  generateConfirmationCode,
  generateSafeConfirmationCode,
} from "@/lib/services/confirmation-code.service";
import { CONFIRMATION_CODE_CHARS } from "@/lib/utils/constants";
import { containsProfanity } from "@/lib/utils/profanity-filter";

describe("generateConfirmationCode", () => {
  it("generates a 6-character code", () => {
    const code = generateConfirmationCode();
    expect(code).toHaveLength(6);
  });

  it("only uses allowed characters", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateConfirmationCode();
      for (const char of code) {
        expect(CONFIRMATION_CODE_CHARS).toContain(char);
      }
    }
  });
});

describe("generateSafeConfirmationCode", () => {
  it("returns a code that passes profanity filter", () => {
    const code = generateSafeConfirmationCode();
    expect(containsProfanity(code)).toBe(false);
  });

  it("retries when profanity detected", () => {
    // Generate many codes — all should pass
    for (let i = 0; i < 50; i++) {
      const code = generateSafeConfirmationCode();
      expect(code).toHaveLength(6);
      expect(containsProfanity(code)).toBe(false);
    }
  });

  it("falls back after maxRetries", () => {
    // With maxRetries=0, it always falls back
    const code = generateSafeConfirmationCode(0);
    expect(code).toHaveLength(6);
  });
});

describe("containsProfanity", () => {
  it("blocks known offensive substrings", () => {
    expect(containsProfanity("XFUKX")).toBe(true);
    expect(containsProfanity("ASSMAN")).toBe(true);
    expect(containsProfanity("SEXBOT")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(containsProfanity("fuk")).toBe(true);
    expect(containsProfanity("Fuk")).toBe(true);
  });

  it("allows clean codes", () => {
    expect(containsProfanity("ABC123")).toBe(false);
    expect(containsProfanity("R26KIM")).toBe(false);
    expect(containsProfanity("LMNPQR")).toBe(false);
  });
});
