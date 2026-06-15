import { describe, it, expect } from "vitest";
import {
  pickBestMembership,
  type MembershipCodeRow,
} from "@/lib/services/participant-code.service";

const row = (overrides: Partial<MembershipCodeRow>): MembershipCodeRow => ({
  id: "m1",
  participant_code: null,
  status: "ACTIVE",
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("pickBestMembership", () => {
  it("returns null for empty input", () => {
    expect(pickBestMembership([])).toBeNull();
  });

  it("returns the only row, even when its code is NULL", () => {
    const only = row({ id: "m1", participant_code: null });
    expect(pickBestMembership([only])).toBe(only);
  });

  it("prefers a row with a code over a row without one, regardless of order", () => {
    const noCode = row({ id: "m1", participant_code: null });
    const withCode = row({ id: "m2", participant_code: "ABC123" });
    expect(pickBestMembership([noCode, withCode])?.id).toBe("m2");
    expect(pickBestMembership([withCode, noCode])?.id).toBe("m2");
  });

  it("prefers the OLDEST code-bearing row — the original, permanent code", () => {
    const older = row({
      id: "m2",
      participant_code: "AAA111",
      created_at: "2026-01-01T00:00:00Z",
    });
    const newer = row({
      id: "m1",
      participant_code: "BBB222",
      created_at: "2026-03-01T00:00:00Z",
    });
    expect(pickBestMembership([older, newer])?.id).toBe("m2");
    expect(pickBestMembership([newer, older])?.id).toBe("m2");
  });

  // The two regressions below are the whole point of the deterministic ranking:
  // the QR must never change under a participant. Status is mutable and new
  // duplicate rows can appear at any time, so neither may move the chosen code.
  it("is STABLE when a membership status flips (status is ignored)", () => {
    const before = [
      row({ id: "m1", participant_code: "AAA111", status: "ACTIVE", created_at: "2026-01-01T00:00:00Z" }),
      row({ id: "m2", participant_code: "BBB222", status: "ACTIVE", created_at: "2026-02-01T00:00:00Z" }),
    ];
    const after = [
      row({ id: "m1", participant_code: "AAA111", status: "REMOVED", created_at: "2026-01-01T00:00:00Z" }),
      row({ id: "m2", participant_code: "BBB222", status: "ACTIVE", created_at: "2026-02-01T00:00:00Z" }),
    ];
    expect(pickBestMembership(before)?.participant_code).toBe("AAA111");
    expect(pickBestMembership(after)?.participant_code).toBe("AAA111");
  });

  it("is STABLE when a newer duplicate row is added later", () => {
    const original = row({
      id: "m1",
      participant_code: "AAA111",
      created_at: "2026-01-01T00:00:00Z",
    });
    const pickBefore = pickBestMembership([original])?.participant_code;

    const newerDuplicate = row({
      id: "m2",
      participant_code: "ZZZ999",
      created_at: "2026-05-01T00:00:00Z",
    });
    const pickAfter = pickBestMembership([original, newerDuplicate])?.participant_code;

    expect(pickBefore).toBe("AAA111");
    expect(pickAfter).toBe("AAA111");
  });

  it("falls back to the smallest id when timestamps tie", () => {
    const a = row({ id: "m2", participant_code: "AAA111", created_at: "2026-01-01T00:00:00Z" });
    const b = row({ id: "m1", participant_code: "BBB222", created_at: "2026-01-01T00:00:00Z" });
    expect(pickBestMembership([a, b])?.id).toBe("m1");
    expect(pickBestMembership([b, a])?.id).toBe("m1");
  });

  it("prefers a known timestamp over a missing one (NULL created_at sorts last)", () => {
    const noDate = row({ id: "m1", participant_code: "AAA111", created_at: null });
    const withDate = row({
      id: "m2",
      participant_code: "BBB222",
      created_at: "2026-03-01T00:00:00Z",
    });
    expect(pickBestMembership([noDate, withDate])?.id).toBe("m2");
    expect(pickBestMembership([withDate, noDate])?.id).toBe("m2");
  });

  it("falls back to the smallest id when both timestamps are missing", () => {
    const a = row({ id: "m2", participant_code: "AAA111", created_at: null });
    const b = row({ id: "m1", participant_code: "BBB222", created_at: null });
    expect(pickBestMembership([a, b])?.id).toBe("m1");
  });

  it("does not mutate the input array", () => {
    const rows = [
      row({ id: "m1", participant_code: null }),
      row({ id: "m2", participant_code: "ABC123" }),
    ];
    const snapshot = [...rows];
    pickBestMembership(rows);
    expect(rows).toEqual(snapshot);
  });
});
