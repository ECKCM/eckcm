import { describe, it, expect } from "vitest";
import {
  generateEPassToken,
  verifyEPassToken,
  signParticipantCode,
  verifySignedCode,
} from "@/lib/services/epass.service";

describe("generateEPassToken", () => {
  it("returns a token and its SHA-256 hash", () => {
    const { token, tokenHash } = generateEPassToken();
    expect(token).toBeTruthy();
    expect(tokenHash).toBeTruthy();
    expect(token.length).toBe(22); // UUID (16 bytes) → base64url = 22 chars
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it("generates unique tokens on each call", () => {
    const a = generateEPassToken();
    const b = generateEPassToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});

describe("verifyEPassToken", () => {
  it("returns true for matching token/hash pair", () => {
    const { token, tokenHash } = generateEPassToken();
    expect(verifyEPassToken(token, tokenHash)).toBe(true);
  });

  it("returns false for wrong token", () => {
    const { tokenHash } = generateEPassToken();
    expect(verifyEPassToken("wrong-token", tokenHash)).toBe(false);
  });

  it("returns false for wrong hash", () => {
    const { token } = generateEPassToken();
    expect(verifyEPassToken(token, "0".repeat(64))).toBe(false);
  });

  it("returns false for empty token", () => {
    const { tokenHash } = generateEPassToken();
    expect(verifyEPassToken("", tokenHash)).toBe(false);
  });
});

describe("signParticipantCode", () => {
  const secret = "test-secret-key";

  it("returns CODE.signature format", () => {
    const signed = signParticipantCode("ABCD23", secret);
    expect(signed).toMatch(/^ABCD23\.[0-9a-f]{8}$/);
  });

  it("produces consistent signatures for same input", () => {
    const a = signParticipantCode("CODE1", secret);
    const b = signParticipantCode("CODE1", secret);
    expect(a).toBe(b);
  });

  it("produces different signatures for different codes", () => {
    const a = signParticipantCode("CODE1", secret);
    const b = signParticipantCode("CODE2", secret);
    expect(a).not.toBe(b);
  });

  it("produces different signatures for different secrets", () => {
    const a = signParticipantCode("CODE1", "secret-a");
    const b = signParticipantCode("CODE1", "secret-b");
    expect(a).not.toBe(b);
  });
});

describe("verifySignedCode", () => {
  const secret = "test-secret-key";

  it("validates correctly signed code", () => {
    const signed = signParticipantCode("ABCD23", secret);
    const result = verifySignedCode(signed, secret);
    expect(result.valid).toBe(true);
    expect(result.participantCode).toBe("ABCD23");
  });

  it("rejects tampered signature", () => {
    const signed = signParticipantCode("ABCD23", secret);
    const tampered = signed.slice(0, -1) + "0"; // change last char
    const result = verifySignedCode(tampered, secret);
    expect(result.valid).toBe(false);
    expect(result.participantCode).toBe("ABCD23");
  });

  it("rejects wrong secret", () => {
    const signed = signParticipantCode("ABCD23", secret);
    const result = verifySignedCode(signed, "wrong-secret");
    expect(result.valid).toBe(false);
  });

  it("returns valid=false for string without dot separator", () => {
    const result = verifySignedCode("NODOT", secret);
    expect(result.valid).toBe(false);
    expect(result.participantCode).toBe("NODOT");
  });

  it("handles code containing dots (uses lastIndexOf)", () => {
    // Code with dots: "A.B.sig"
    const code = "A.B";
    const signed = signParticipantCode(code, secret);
    const result = verifySignedCode(signed, secret);
    expect(result.valid).toBe(true);
    expect(result.participantCode).toBe("A.B");
  });
});
