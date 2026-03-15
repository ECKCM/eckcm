import { describe, it, expect } from "vitest";
import { isValidCalendarDate, calculateAge } from "@/lib/utils/validators";

describe("isValidCalendarDate", () => {
  it("accepts valid dates", () => {
    expect(isValidCalendarDate(2026, 1, 1)).toBe(true);
    expect(isValidCalendarDate(2026, 6, 30)).toBe(true);
    expect(isValidCalendarDate(2026, 12, 31)).toBe(true);
  });

  it("rejects Feb 30", () => {
    expect(isValidCalendarDate(2026, 2, 30)).toBe(false);
  });

  it("rejects Feb 29 in non-leap year", () => {
    expect(isValidCalendarDate(2025, 2, 29)).toBe(false);
    expect(isValidCalendarDate(2026, 2, 29)).toBe(false);
  });

  it("accepts Feb 29 in leap year", () => {
    expect(isValidCalendarDate(2024, 2, 29)).toBe(true);
    expect(isValidCalendarDate(2028, 2, 29)).toBe(true);
  });

  it("rejects April 31", () => {
    expect(isValidCalendarDate(2026, 4, 31)).toBe(false);
  });

  it("rejects month 0 and 13", () => {
    expect(isValidCalendarDate(2026, 0, 15)).toBe(false);
    expect(isValidCalendarDate(2026, 13, 1)).toBe(false);
  });

  it("rejects day 0", () => {
    expect(isValidCalendarDate(2026, 1, 0)).toBe(false);
  });

  it("rejects day 32", () => {
    expect(isValidCalendarDate(2026, 1, 32)).toBe(false);
  });
});

describe("calculateAge", () => {
  it("returns correct age when birthday has passed", () => {
    const birth = new Date(1990, 0, 15); // Jan 15
    const ref = new Date(2026, 5, 21); // Jun 21
    expect(calculateAge(birth, ref)).toBe(36);
  });

  it("returns age-1 when birthday has not yet occurred", () => {
    const birth = new Date(1990, 11, 25); // Dec 25
    const ref = new Date(2026, 5, 21); // Jun 21
    expect(calculateAge(birth, ref)).toBe(35);
  });

  it("returns correct age on exact birthday", () => {
    const birth = new Date(1990, 5, 21); // Jun 21
    const ref = new Date(2026, 5, 21); // Jun 21
    expect(calculateAge(birth, ref)).toBe(36);
  });

  it("returns age-1 when birthday is tomorrow (same month)", () => {
    const birth = new Date(1990, 5, 22); // Jun 22
    const ref = new Date(2026, 5, 21); // Jun 21
    expect(calculateAge(birth, ref)).toBe(35);
  });

  it("handles leap year birthday (Feb 29)", () => {
    const birth = new Date(2020, 1, 29); // Feb 29
    const ref = new Date(2026, 5, 21); // Jun 21
    expect(calculateAge(birth, ref)).toBe(6);
  });

  it("handles newborn (age 0)", () => {
    const birth = new Date(2026, 5, 1); // Jun 1
    const ref = new Date(2026, 5, 21); // Jun 21
    expect(calculateAge(birth, ref)).toBe(0);
  });

  it("handles infant under threshold (age 3)", () => {
    const birth = new Date(2023, 0, 1); // Jan 1, 2023
    const ref = new Date(2026, 5, 21); // Jun 21, 2026
    expect(calculateAge(birth, ref)).toBe(3);
  });

  it("correctly classifies 4-year-old at event start", () => {
    // Born Jul 1, 2022 → age 3 on Jun 21, 2026 (birthday hasn't passed)
    const birth = new Date(2022, 6, 1);
    const ref = new Date(2026, 5, 21);
    expect(calculateAge(birth, ref)).toBe(3);

    // Born Jun 20, 2022 → age 4 on Jun 21, 2026 (birthday passed yesterday)
    const birth2 = new Date(2022, 5, 20);
    expect(calculateAge(birth2, ref)).toBe(4);
  });
});
