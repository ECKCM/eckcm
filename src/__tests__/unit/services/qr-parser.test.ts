import { describe, it, expect } from "vitest";
import { parseQRValue, toVerifyBody } from "@/lib/checkin/qr-parser";
import { signParticipantCode, verifySignedCode } from "@/lib/services/epass.service";

describe("parseQRValue — participant codes", () => {
  it("parses a plain 6-char participant code", () => {
    expect(parseQRValue("BL9RA5")).toEqual({
      kind: "participantCode",
      participantCode: "BL9RA5",
    });
  });

  it("parses a canonical HMAC-signed code (camera path)", () => {
    expect(parseQRValue("BL9RA5.a1b2c3d4")).toEqual({
      kind: "participantCode",
      participantCode: "BL9RA5.a1b2c3d4",
    });
  });

  // The HID-scanner mangling cases — these all used to return null, which is
  // exactly why "camera works but the reader shows Invalid QR".
  it("recovers an uppercased signature from a HID scanner", () => {
    expect(parseQRValue("BL9RA5.A1B2C3D4")).toEqual({
      kind: "participantCode",
      participantCode: "BL9RA5.a1b2c3d4",
    });
  });

  it("recovers a dot the reader dropped (code glued to signature)", () => {
    expect(parseQRValue("BL9RA5A1B2C3D4")).toEqual({
      kind: "participantCode",
      participantCode: "BL9RA5.a1b2c3d4",
    });
  });

  it("recovers a fully lowercased scan", () => {
    expect(parseQRValue("bl9ra5.a1b2c3d4")).toEqual({
      kind: "participantCode",
      participantCode: "BL9RA5.a1b2c3d4",
    });
  });

  it("strips a stray space some readers inject around the dot", () => {
    expect(parseQRValue("BL9RA5 .a1b2c3d4")).toEqual({
      kind: "participantCode",
      participantCode: "BL9RA5.a1b2c3d4",
    });
  });

  it("is whitespace-tolerant at the edges", () => {
    expect(parseQRValue("  BL9RA5  ")).toEqual({
      kind: "participantCode",
      participantCode: "BL9RA5",
    });
  });
});

describe("parseQRValue — tokens", () => {
  it("extracts a token from an e-pass URL", () => {
    expect(parseQRValue("https://eckcm.com/epass/AbCdEf0123456789xyzAB")).toEqual({
      kind: "token",
      token: "AbCdEf0123456789xyzAB",
    });
  });

  it("extracts a token from a slugged e-pass URL", () => {
    expect(
      parseQRValue("https://eckcm.com/epass/abigail_AbCdEf0123456789xyzAB")
    ).toEqual({ kind: "token", token: "AbCdEf0123456789xyzAB" });
  });

  it("keeps a legacy opaque token case-sensitive", () => {
    expect(parseQRValue("AbCdEf0123456789xyzAB")).toEqual({
      kind: "token",
      token: "AbCdEf0123456789xyzAB",
    });
  });
});

describe("parseQRValue — disposable meal passes", () => {
  // 32-char base64url, the shape generateEPassToken() emits.
  const token = "AbCdEf0123456789xyzABml9RA5Qz7Kp";

  it("extracts a meal-pass token from a /m/ URL", () => {
    expect(parseQRValue(`https://eckcm.com/m/${token}`)).toEqual({
      kind: "mealPass",
      token,
    });
  });

  it("classifies /m/ as a meal pass, never an e-pass token", () => {
    // The token shape overlaps the e-pass token regex, so the /m/ path MUST be
    // tested first. Guards against a meal-pass QR being routed to e-pass verify.
    const parsed = parseQRValue(`https://eckcm.com/m/${token}`);
    expect(parsed?.kind).toBe("mealPass");
  });

  it("is whitespace-tolerant for /m/ URLs", () => {
    expect(parseQRValue(`  https://eckcm.com/m/${token}  `)).toEqual({
      kind: "mealPass",
      token,
    });
  });

  it("does not treat an /epass/ URL as a meal pass", () => {
    expect(
      parseQRValue("https://eckcm.com/epass/AbCdEf0123456789xyzAB")
    ).toEqual({ kind: "token", token: "AbCdEf0123456789xyzAB" });
  });
});

describe("parseQRValue — rejects", () => {
  it("returns null for empty input", () => {
    expect(parseQRValue("")).toBeNull();
    expect(parseQRValue("   ")).toBeNull();
  });

  it("returns null for an unrelated short string", () => {
    expect(parseQRValue("HELLOWORLD")).toBeNull();
  });

  it("returns null for a code using excluded letters (I/O/0/1)", () => {
    // 'O' and '0' are not in the Crockford-ish alphabet.
    expect(parseQRValue("OO0011")).toBeNull();
  });
});

describe("parseQRValue → HMAC verify round-trip", () => {
  const secret = "test-secret-key";
  const code = "BL9RA5";
  const canonical = signParticipantCode(code, secret); // e.g. "BL9RA5.xxxxxxxx"

  it("a canonical signed QR verifies", () => {
    const parsed = parseQRValue(canonical)!;
    expect(parsed.kind).toBe("participantCode");
    const { participantCode } = toVerifyBody(parsed);
    const { valid, participantCode: recovered } = verifySignedCode(
      participantCode!,
      secret
    );
    expect(valid).toBe(true);
    expect(recovered).toBe(code);
  });

  it("an uppercased-signature scan still verifies after normalization", () => {
    const mangled = canonical.toUpperCase(); // reader uppercased everything
    const parsed = parseQRValue(mangled)!;
    const { participantCode } = toVerifyBody(parsed);
    const { valid, participantCode: recovered } = verifySignedCode(
      participantCode!,
      secret
    );
    expect(valid).toBe(true);
    expect(recovered).toBe(code);
  });

  it("a dropped-dot scan still verifies after normalization", () => {
    const mangled = canonical.replace(".", ""); // reader dropped the dot
    const parsed = parseQRValue(mangled)!;
    const { participantCode } = toVerifyBody(parsed);
    const { valid, participantCode: recovered } = verifySignedCode(
      participantCode!,
      secret
    );
    expect(valid).toBe(true);
    expect(recovered).toBe(code);
  });
});
