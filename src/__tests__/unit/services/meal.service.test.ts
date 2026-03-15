import { describe, it, expect } from "vitest";
import { populateDefaultMeals } from "@/lib/services/meal.service";
import type { RoomGroupInput, ParticipantInput } from "@/lib/types/registration";

function makeParticipant(
  overrides: Partial<ParticipantInput> = {}
): ParticipantInput {
  return {
    id: "p1",
    isRepresentative: false,
    isExistingPerson: false,
    lastName: "Kim",
    firstName: "Scott",
    gender: "MALE",
    birthYear: 1990,
    birthMonth: 1,
    birthDay: 1,
    isK12: false,
    phone: "",
    phoneCountry: "US",
    email: "",
    mealSelections: [],
    ...overrides,
  };
}

function makeGroup(
  participants: ParticipantInput[],
  overrides: Partial<RoomGroupInput> = {}
): RoomGroupInput {
  return {
    id: "g1",
    participants,
    lodgingType: "LODGING_AC",
    preferences: { elderly: false, handicapped: false, firstFloor: false },
    keyCount: 1,
    ...overrides,
  };
}

describe("populateDefaultMeals", () => {
  // Event: Jun 21 (start) - Jun 28 (end), 2026
  const eventStart = "2026-06-21";
  const eventEnd = "2026-06-28";
  const mealStart = "2026-06-21";
  const mealEnd = "2026-06-28";

  it("generates BREAKFAST/LUNCH/DINNER for each eligible date", () => {
    const participant = makeParticipant();
    const groups = [makeGroup([participant])];

    const result = populateDefaultMeals(
      groups,
      mealStart,
      mealEnd,
      eventStart,
      eventEnd
    );

    const meals = result[0].participants[0].mealSelections;
    // Jun 22-27 = 6 eligible dates (start and end excluded)
    expect(meals.length).toBe(6 * 3); // 6 dates × 3 meals
    expect(meals.every((m) => m.selected)).toBe(true);
  });

  it("excludes event start date", () => {
    const participant = makeParticipant();
    const groups = [makeGroup([participant])];

    const result = populateDefaultMeals(
      groups,
      mealStart,
      mealEnd,
      eventStart,
      eventEnd
    );

    const meals = result[0].participants[0].mealSelections;
    const startDateMeals = meals.filter((m) => m.date === eventStart);
    expect(startDateMeals.length).toBe(0);
  });

  it("excludes event end date", () => {
    const participant = makeParticipant();
    const groups = [makeGroup([participant])];

    const result = populateDefaultMeals(
      groups,
      mealStart,
      mealEnd,
      eventStart,
      eventEnd
    );

    const meals = result[0].participants[0].mealSelections;
    const endDateMeals = meals.filter((m) => m.date === eventEnd);
    expect(endDateMeals.length).toBe(0);
  });

  it("preserves existing mealSelections", () => {
    const existingMeals = [
      { date: "2026-06-22", mealType: "BREAKFAST" as const, selected: true },
    ];
    const participant = makeParticipant({ mealSelections: existingMeals });
    const groups = [makeGroup([participant])];

    const result = populateDefaultMeals(
      groups,
      mealStart,
      mealEnd,
      eventStart,
      eventEnd
    );

    // Should keep existing, not replace
    expect(result[0].participants[0].mealSelections).toBe(existingMeals);
  });

  it("uses participant-specific dates when overridden", () => {
    // Participant arrives Jun 23, departs Jun 26
    const participant = makeParticipant({
      checkInDate: "2026-06-23",
      checkOutDate: "2026-06-26",
    });
    const groups = [makeGroup([participant])];

    const result = populateDefaultMeals(
      groups,
      mealStart,
      mealEnd,
      eventStart,
      eventEnd
    );

    const meals = result[0].participants[0].mealSelections;
    const dates = [...new Set(meals.map((m) => m.date))];
    // Jun 23-26 range, excluding event start (Jun 21) and end (Jun 28)
    // But also need to check: Jun 23, 24, 25, 26 — none match start/end, so all included
    expect(dates).toContain("2026-06-23");
    expect(dates).toContain("2026-06-24");
    expect(dates).toContain("2026-06-25");
    expect(dates).toContain("2026-06-26");
    expect(meals.length).toBe(4 * 3); // 4 dates × 3 meals
  });

  it("handles single-day range that matches event start (no meals)", () => {
    const participant = makeParticipant({
      checkInDate: "2026-06-21",
      checkOutDate: "2026-06-21",
    });
    const groups = [makeGroup([participant])];

    const result = populateDefaultMeals(
      groups,
      mealStart,
      mealEnd,
      eventStart,
      eventEnd
    );

    // Jun 21 is event start, excluded → 0 meals
    expect(result[0].participants[0].mealSelections.length).toBe(0);
  });
});
