import { describe, it, expect } from "vitest";
import {
  estimateSchema,
  submitRegistrationSchema,
  createIntentSchema,
  confirmPaymentSchema,
  zelleSubmitSchema,
} from "@/lib/schemas/api";

const validUUID = "550e8400-e29b-41d4-a716-446655440000";

function validParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: "client-1",
    isRepresentative: true,
    isExistingPerson: false,
    lastName: "Kim",
    firstName: "Scott",
    gender: "MALE",
    birthYear: 1990,
    birthMonth: 6,
    birthDay: 15,
    isK12: false,
    phone: "+1 555-1234",
    phoneCountry: "US",
    email: "test@test.com",
    mealSelections: [],
    ...overrides,
  };
}

function validRoomGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-1",
    participants: [validParticipant()],
    lodgingType: "LODGING_AC",
    preferences: { elderly: false, handicapped: false, firstFloor: false },
    keyCount: 1,
    ...overrides,
  };
}

describe("estimateSchema", () => {
  it("accepts valid payload", () => {
    const data = {
      eventId: validUUID,
      startDate: "2026-06-21",
      endDate: "2026-06-28",
      nightsCount: 7,
      registrationGroupId: validUUID,
      roomGroups: [validRoomGroup()],
    };
    expect(() => estimateSchema.parse(data)).not.toThrow();
  });

  it("rejects non-UUID eventId", () => {
    const data = {
      eventId: "not-a-uuid",
      startDate: "2026-06-21",
      endDate: "2026-06-28",
      nightsCount: 7,
      registrationGroupId: validUUID,
      roomGroups: [validRoomGroup()],
    };
    const result = estimateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects non-YYYY-MM-DD date", () => {
    const data = {
      eventId: validUUID,
      startDate: "06/21/2026",
      endDate: "2026-06-28",
      nightsCount: 7,
      registrationGroupId: validUUID,
      roomGroups: [validRoomGroup()],
    };
    const result = estimateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("requires at least 1 room group", () => {
    const data = {
      eventId: validUUID,
      startDate: "2026-06-21",
      endDate: "2026-06-28",
      nightsCount: 7,
      registrationGroupId: validUUID,
      roomGroups: [],
    };
    const result = estimateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("allows max 20 room groups", () => {
    const data = {
      eventId: validUUID,
      startDate: "2026-06-21",
      endDate: "2026-06-28",
      nightsCount: 7,
      registrationGroupId: validUUID,
      roomGroups: Array.from({ length: 21 }, (_, i) =>
        validRoomGroup({ id: `g${i}` })
      ),
    };
    const result = estimateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("participant birth date validation", () => {
  it("rejects invalid birth date (Feb 30)", () => {
    const data = {
      eventId: validUUID,
      startDate: "2026-06-21",
      endDate: "2026-06-28",
      nightsCount: 7,
      registrationGroupId: validUUID,
      roomGroups: [
        validRoomGroup({
          participants: [validParticipant({ birthMonth: 2, birthDay: 30 })],
        }),
      ],
    };
    const result = estimateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects Feb 29 in non-leap year", () => {
    const data = {
      eventId: validUUID,
      startDate: "2026-06-21",
      endDate: "2026-06-28",
      nightsCount: 7,
      registrationGroupId: validUUID,
      roomGroups: [
        validRoomGroup({
          participants: [
            validParticipant({ birthYear: 2025, birthMonth: 2, birthDay: 29 }),
          ],
        }),
      ],
    };
    const result = estimateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("accepts Feb 29 in leap year", () => {
    const data = {
      eventId: validUUID,
      startDate: "2026-06-21",
      endDate: "2026-06-28",
      nightsCount: 7,
      registrationGroupId: validUUID,
      roomGroups: [
        validRoomGroup({
          participants: [
            validParticipant({ birthYear: 2024, birthMonth: 2, birthDay: 29 }),
          ],
        }),
      ],
    };
    const result = estimateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe("submitRegistrationSchema", () => {
  it("accepts valid submit payload", () => {
    const data = {
      eventId: validUUID,
      registrationType: "self",
      startDate: "2026-06-21",
      endDate: "2026-06-28",
      nightsCount: 7,
      registrationGroupId: validUUID,
      roomGroups: [validRoomGroup()],
      keyDeposit: 2000,
    };
    expect(() => submitRegistrationSchema.parse(data)).not.toThrow();
  });

  it("defaults registrationType to 'self'", () => {
    const data = {
      eventId: validUUID,
      startDate: "2026-06-21",
      endDate: "2026-06-28",
      nightsCount: 7,
      registrationGroupId: validUUID,
      roomGroups: [validRoomGroup()],
      keyDeposit: 0,
    };
    const result = submitRegistrationSchema.parse(data);
    expect(result.registrationType).toBe("self");
  });

  it("rejects invalid registrationType", () => {
    const data = {
      eventId: validUUID,
      registrationType: "invalid",
      startDate: "2026-06-21",
      endDate: "2026-06-28",
      nightsCount: 7,
      registrationGroupId: validUUID,
      roomGroups: [validRoomGroup()],
      keyDeposit: 0,
    };
    const result = submitRegistrationSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe("createIntentSchema", () => {
  it("accepts valid payload", () => {
    const data = { registrationId: validUUID };
    expect(() => createIntentSchema.parse(data)).not.toThrow();
  });

  it("rejects missing registrationId", () => {
    const result = createIntentSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("coversFees is optional", () => {
    const data = { registrationId: validUUID, coversFees: true };
    const result = createIntentSchema.parse(data);
    expect(result.coversFees).toBe(true);
  });
});

describe("confirmPaymentSchema", () => {
  it("requires both registrationId and paymentIntentId", () => {
    expect(confirmPaymentSchema.safeParse({}).success).toBe(false);
    expect(
      confirmPaymentSchema.safeParse({ registrationId: validUUID }).success
    ).toBe(false);
    expect(
      confirmPaymentSchema.safeParse({
        registrationId: validUUID,
        paymentIntentId: "pi_test123",
      }).success
    ).toBe(true);
  });
});

describe("zelleSubmitSchema", () => {
  it("requires registrationId", () => {
    expect(zelleSubmitSchema.safeParse({}).success).toBe(false);
    expect(
      zelleSubmitSchema.safeParse({ registrationId: validUUID }).success
    ).toBe(true);
  });
});
