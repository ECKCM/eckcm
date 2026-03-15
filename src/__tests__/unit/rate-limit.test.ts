import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows requests within limit", () => {
    const key = `test-allow-${Date.now()}`;
    const r1 = rateLimit(key, 3, 60_000);
    const r2 = rateLimit(key, 3, 60_000);
    const r3 = rateLimit(key, 3, 60_000);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  it("blocks requests exceeding limit", () => {
    const key = `test-block-${Date.now()}`;
    rateLimit(key, 2, 60_000);
    rateLimit(key, 2, 60_000);
    const r3 = rateLimit(key, 2, 60_000);
    expect(r3.allowed).toBe(false);
    if (!r3.allowed) {
      expect(r3.retryAfterMs).toBeGreaterThan(0);
      expect(r3.retryAfterMs).toBeLessThanOrEqual(60_000);
    }
  });

  it("resets after window expires", async () => {
    const key = `test-reset-${Date.now()}`;
    // Fill up with windowMs=50ms
    rateLimit(key, 1, 50);
    const r2 = rateLimit(key, 1, 50);
    expect(r2.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 60));
    const r3 = rateLimit(key, 1, 50);
    expect(r3.allowed).toBe(true);
  });

  it("isolates different keys", () => {
    const keyA = `test-iso-a-${Date.now()}`;
    const keyB = `test-iso-b-${Date.now()}`;
    rateLimit(keyA, 1, 60_000);
    const r = rateLimit(keyA, 1, 60_000);
    expect(r.allowed).toBe(false);

    // Different key should still be allowed
    const rB = rateLimit(keyB, 1, 60_000);
    expect(rB.allowed).toBe(true);
  });
});
