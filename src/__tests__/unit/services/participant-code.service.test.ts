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

  it("prefers a row with a code over a row without one, regardless of status", () => {
    const activeNoCode = row({ id: "m1", participant_code: null, status: "ACTIVE" });
    const removedWithCode = row({ id: "m2", participant_code: "ABC123", status: "REMOVED" });
    expect(pickBestMembership([activeNoCode, removedWithCode])?.id).toBe("m2");
    expect(pickBestMembership([removedWithCode, activeNoCode])?.id).toBe("m2");
  });

  it("prefers the ACTIVE row when both rows have codes", () => {
    const removed = row({ id: "m1", participant_code: "AAA111", status: "REMOVED" });
    const active = row({ id: "m2", participant_code: "BBB222", status: "ACTIVE" });
    expect(pickBestMembership([removed, active])?.id).toBe("m2");
    expect(pickBestMembership([active, removed])?.id).toBe("m2");
  });

  it("prefers the most recently created row when code and status tie", () => {
    const older = row({
      id: "m1",
      participant_code: "AAA111",
      created_at: "2026-01-01T00:00:00Z",
    });
    const newer = row({
      id: "m2",
      participant_code: "BBB222",
      created_at: "2026-03-01T00:00:00Z",
    });
    expect(pickBestMembership([older, newer])?.id).toBe("m2");
    expect(pickBestMembership([newer, older])?.id).toBe("m2");
  });

  it("tolerates missing created_at values", () => {
    const noDate = row({ id: "m1", participant_code: "AAA111", created_at: null });
    const withDate = row({
      id: "m2",
      participant_code: "BBB222",
      created_at: "2026-03-01T00:00:00Z",
    });
    expect(pickBestMembership([noDate, withDate])?.id).toBe("m2");
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
