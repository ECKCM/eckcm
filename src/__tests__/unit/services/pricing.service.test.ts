import { describe, it, expect } from "vitest";
import { calculateEstimate, computeWaivedBenefits } from "@/lib/services/pricing.service";
import type { LodgingRate, MealFeeCategory } from "@/lib/services/pricing.service";
import type { ParticipantInput, RoomGroupInput, PriceEstimate } from "@/lib/types/registration";

// -- Helpers --

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
    birthDay: 15,
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

const defaultLodgingRates: LodgingRate[] = [
  { code: "LODGING_AC", name_en: "AC Room", pricing_type: "PER_NIGHT", amount_cents: 5000 },
  { code: "LODGING_FAN", name_en: "Fan Room", pricing_type: "PER_NIGHT", amount_cents: 3000 },
  { code: "LODGING_FLAT", name_en: "Flat Rate", pricing_type: "FLAT", amount_cents: 20000 },
];

const defaultMealCategories: MealFeeCategory[] = [
  { code: "MEAL_ADULT", name_en: "Meal - Adult", pricing_type: "PER_MEAL", amount_cents: 500, age_min: 13, age_max: null },
  { code: "MEAL_ADULT_DAY", name_en: "Meal - Adult Day", pricing_type: "FLAT", amount_cents: 1200, age_min: 13, age_max: null },
  { code: "MEAL_CHILD", name_en: "Meal - Child", pricing_type: "PER_MEAL", amount_cents: 300, age_min: 4, age_max: 12 },
  { code: "MEAL_CHILD_DAY", name_en: "Meal - Child Day", pricing_type: "FLAT", amount_cents: 700, age_min: 4, age_max: 12 },
  { code: "MEAL_INFANT", name_en: "Meal - Infant", pricing_type: "PER_MEAL", amount_cents: 0, age_min: 0, age_max: 3 },
];

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    nightsCount: 7,
    roomGroups: [makeGroup([makeParticipant()])],
    registrationFeePerPerson: 10000, // $100
    earlyBirdFeePerPerson: 8000, // $80
    isEarlyBird: false,
    keyDepositPerKey: 2000, // $20
    additionalLodgingThreshold: 4,
    additionalLodgingFeePerNight: 1000, // $10/night
    lodgingRates: defaultLodgingRates,
    mealFeeCategories: defaultMealCategories,
    eventStartDate: "2026-06-21",
    vbsMaterialsFeeCents: 500,
    vbsDepartmentIds: ["dept-vbs-1"],
    manualPaymentDiscountPerPerson: 0,
    applyGeneralFeesToMembers: true,
    applyMealFeesToMembers: true,
    defaultRegistrationFeePerPerson: 10000,
    defaultEarlyBirdFeePerPerson: 8000,
    defaultIsEarlyBird: false,
    defaultMealFeeCategories: defaultMealCategories,
    defaultManualPaymentDiscountPerPerson: 0,
    regFeeAgeMin: null,
    regFeeAgeMax: null,
    earlyBirdAgeMin: null,
    earlyBirdAgeMax: null,
    defaultRegFeeAgeMin: null,
    defaultRegFeeAgeMax: null,
    defaultEarlyBirdAgeMin: null,
    defaultEarlyBirdAgeMax: null,
    ...overrides,
  };
}

// -- Tests --

describe("calculateEstimate", () => {
  describe("registration fee", () => {
    it("calculates standard fee per person", () => {
      const result = calculateEstimate(makeInput());
      expect(result.registrationFee).toBe(10000); // 1 person × $100
    });

    it("applies early bird rate when isEarlyBird=true", () => {
      const result = calculateEstimate(makeInput({ isEarlyBird: true }));
      expect(result.registrationFee).toBe(8000); // 1 person × $80
    });

    it("uses standard rate when earlyBirdFeePerPerson is null", () => {
      const result = calculateEstimate(
        makeInput({ isEarlyBird: true, earlyBirdFeePerPerson: null })
      );
      expect(result.registrationFee).toBe(10000);
    });

    it("multiplies by total participants across groups", () => {
      const result = calculateEstimate(
        makeInput({
          roomGroups: [
            makeGroup([makeParticipant(), makeParticipant({ id: "p2" })]),
            makeGroup([makeParticipant({ id: "p3" })], { id: "g2" }),
          ],
        })
      );
      expect(result.registrationFee).toBe(30000); // 3 × $100
    });

    it("skips line item when fee is 0", () => {
      const result = calculateEstimate(
        makeInput({ registrationFeePerPerson: 0 })
      );
      expect(result.registrationFee).toBe(0);
      expect(result.breakdown.find((b) => b.description.includes("Registration"))).toBeUndefined();
    });

    it("exempts participants under age_min from registration fee", () => {
      // age_min=5, infant born 2024 → age ~2 → exempt
      const result = calculateEstimate(
        makeInput({
          regFeeAgeMin: 5,
          roomGroups: [
            makeGroup([
              makeParticipant({
                id: "infant",
                birthYear: 2024,
                birthMonth: 1,
                birthDay: 1,
              }),
            ]),
          ],
        })
      );
      expect(result.registrationFee).toBe(0);
    });

    it("charges participants at exactly age_min", () => {
      // age_min=5, child born 2021-06-21 → exactly 5 at event start 2026-06-21
      const result = calculateEstimate(
        makeInput({
          regFeeAgeMin: 5,
          roomGroups: [
            makeGroup([
              makeParticipant({
                id: "child5",
                birthYear: 2021,
                birthMonth: 6,
                birthDay: 21,
              }),
            ]),
          ],
        })
      );
      expect(result.registrationFee).toBe(10000); // $100
    });

    it("handles mixed ages — only charges eligible participants", () => {
      // age_min=5: 1 adult (eligible) + 1 infant (exempt)
      const result = calculateEstimate(
        makeInput({
          regFeeAgeMin: 5,
          roomGroups: [
            makeGroup([
              makeParticipant({ id: "adult", birthYear: 1990 }),
              makeParticipant({ id: "infant", birthYear: 2024, birthMonth: 1, birthDay: 1 }),
            ]),
          ],
        })
      );
      expect(result.registrationFee).toBe(10000); // only 1 × $100
      // Breakdown should show quantity=1
      const regLine = result.breakdown.find(
        (b) => b.category === "registration" && b.amount > 0
      );
      expect(regLine?.quantity).toBe(1);
    });

    it("uses early bird age bounds when early bird is active", () => {
      // regFeeAgeMin=5 but earlyBirdAgeMin=3 — early bird allows younger
      const result = calculateEstimate(
        makeInput({
          isEarlyBird: true,
          regFeeAgeMin: 5,
          earlyBirdAgeMin: 3,
          roomGroups: [
            makeGroup([
              makeParticipant({
                id: "child4",
                birthYear: 2022, // ~4 years old
                birthMonth: 1,
                birthDay: 1,
              }),
            ]),
          ],
        })
      );
      // Early bird active → uses earlyBirdAgeMin=3, child age 4 >= 3 → eligible
      expect(result.registrationFee).toBe(8000); // early bird $80
    });

    it("applies age filter in applyGeneralFeesToMembers=false path", () => {
      const rep = makeParticipant({ id: "rep", isRepresentative: true, birthYear: 1990 });
      const infant = makeParticipant({
        id: "infant",
        isRepresentative: false,
        birthYear: 2024,
        birthMonth: 1,
        birthDay: 1,
      });

      const result = calculateEstimate(
        makeInput({
          regFeeAgeMin: 5,
          defaultRegFeeAgeMin: 5,
          registrationFeePerPerson: 7000,
          applyGeneralFeesToMembers: false,
          roomGroups: [makeGroup([rep, infant])],
        })
      );

      // Rep (adult) pays $70, infant is age-exempt from default group fee too
      expect(result.registrationFee).toBe(7000);
    });
  });

  describe("lodging fee", () => {
    it("calculates PER_NIGHT as rate × nightsCount", () => {
      const result = calculateEstimate(makeInput());
      // LODGING_AC = 5000/night × 7 nights
      expect(result.lodgingFee).toBe(35000);
    });

    it("calculates FLAT as fixed amount", () => {
      const result = calculateEstimate(
        makeInput({
          roomGroups: [
            makeGroup([makeParticipant()], { lodgingType: "LODGING_FLAT" }),
          ],
        })
      );
      expect(result.lodgingFee).toBe(20000);
    });

    it("handles group with no matching lodging rate", () => {
      const result = calculateEstimate(
        makeInput({
          roomGroups: [
            makeGroup([makeParticipant()], { lodgingType: "NONEXISTENT" }),
          ],
        })
      );
      expect(result.lodgingFee).toBe(0);
    });

    it("sums lodging across multiple groups", () => {
      const result = calculateEstimate(
        makeInput({
          roomGroups: [
            makeGroup([makeParticipant()], { lodgingType: "LODGING_AC" }),
            makeGroup([makeParticipant({ id: "p2" })], {
              id: "g2",
              lodgingType: "LODGING_FAN",
            }),
          ],
        })
      );
      // AC: 5000 × 7 = 35000, FAN: 3000 × 7 = 21000
      expect(result.lodgingFee).toBe(56000);
    });
  });

  describe("additional lodging fee", () => {
    it("charges extra fee when billable count exceeds threshold", () => {
      // 5 adults in group, threshold=4 → 1 extra
      const participants = Array.from({ length: 5 }, (_, i) =>
        makeParticipant({ id: `p${i}`, birthYear: 1990 })
      );
      const result = calculateEstimate(
        makeInput({
          roomGroups: [makeGroup(participants)],
          additionalLodgingThreshold: 4,
        })
      );
      // 1 extra × 7 nights × $10/night = $70
      expect(result.additionalLodgingFee).toBe(7000);
    });

    it("exempts infants (age < 4) from billable count", () => {
      // 4 adults + 2 infants (age 2) → billable=4, threshold=4 → no extra
      const adults = Array.from({ length: 4 }, (_, i) =>
        makeParticipant({ id: `a${i}`, birthYear: 1990 })
      );
      const infants = Array.from({ length: 2 }, (_, i) =>
        makeParticipant({
          id: `infant${i}`,
          birthYear: 2024, // age ~2 at event
          birthMonth: 1,
          birthDay: 1,
        })
      );
      const result = calculateEstimate(
        makeInput({
          roomGroups: [makeGroup([...adults, ...infants])],
          additionalLodgingThreshold: 4,
        })
      );
      expect(result.additionalLodgingFee).toBe(0);
    });

    it("charges no extra when at threshold exactly", () => {
      const participants = Array.from({ length: 4 }, (_, i) =>
        makeParticipant({ id: `p${i}`, birthYear: 1990 })
      );
      const result = calculateEstimate(
        makeInput({
          roomGroups: [makeGroup(participants)],
          additionalLodgingThreshold: 4,
        })
      );
      expect(result.additionalLodgingFee).toBe(0);
    });
  });

  describe("key deposit", () => {
    it("calculates deposit per key", () => {
      const result = calculateEstimate(makeInput());
      // 1 key × $20 = $20
      expect(result.keyDeposit).toBe(2000);
    });

    it("sums across groups", () => {
      const result = calculateEstimate(
        makeInput({
          roomGroups: [
            makeGroup([makeParticipant()], { keyCount: 2 }),
            makeGroup([makeParticipant({ id: "p2" })], {
              id: "g2",
              keyCount: 1,
            }),
          ],
        })
      );
      expect(result.keyDeposit).toBe(6000); // 3 keys × $20
    });

    it("is zero when keyCount is 0", () => {
      const result = calculateEstimate(
        makeInput({
          roomGroups: [makeGroup([makeParticipant()], { keyCount: 0 })],
        })
      );
      expect(result.keyDeposit).toBe(0);
    });
  });

  describe("meal fee", () => {
    it("matches participant to correct category by age", () => {
      const adultMeals = [
        { date: "2026-06-22", mealType: "BREAKFAST" as const, selected: true },
        { date: "2026-06-22", mealType: "LUNCH" as const, selected: true },
      ];
      const result = calculateEstimate(
        makeInput({
          roomGroups: [
            makeGroup([
              makeParticipant({
                birthYear: 1990,
                mealSelections: adultMeals,
              }),
            ]),
          ],
        })
      );
      // Adult per-meal = 500 cents × 2 meals
      expect(result.mealFee).toBe(1000);
    });

    it("applies full-day discount (min of day vs 3×each)", () => {
      const fullDayMeals = [
        { date: "2026-06-22", mealType: "BREAKFAST" as const, selected: true },
        { date: "2026-06-22", mealType: "LUNCH" as const, selected: true },
        { date: "2026-06-22", mealType: "DINNER" as const, selected: true },
      ];
      const result = calculateEstimate(
        makeInput({
          roomGroups: [
            makeGroup([
              makeParticipant({
                birthYear: 1990,
                mealSelections: fullDayMeals,
              }),
            ]),
          ],
        })
      );
      // Adult: min(1200 day, 3×500=1500) = 1200
      expect(result.mealFee).toBe(1200);
    });

    it("uses 3×perMeal when cheaper than fullDay", () => {
      // Custom categories where 3×perMeal < fullDay
      const cheapMealCats: MealFeeCategory[] = [
        { code: "MEAL_ADULT", name_en: "Meal - Adult", pricing_type: "PER_MEAL", amount_cents: 300, age_min: 13, age_max: null },
        { code: "MEAL_ADULT_DAY", name_en: "Meal - Adult Day", pricing_type: "FLAT", amount_cents: 1200, age_min: 13, age_max: null },
      ];
      const fullDayMeals = [
        { date: "2026-06-22", mealType: "BREAKFAST" as const, selected: true },
        { date: "2026-06-22", mealType: "LUNCH" as const, selected: true },
        { date: "2026-06-22", mealType: "DINNER" as const, selected: true },
      ];
      const result = calculateEstimate(
        makeInput({
          mealFeeCategories: cheapMealCats,
          roomGroups: [
            makeGroup([
              makeParticipant({
                birthYear: 1990,
                mealSelections: fullDayMeals,
              }),
            ]),
          ],
        })
      );
      // min(1200, 3×300=900) = 900
      expect(result.mealFee).toBe(900);
    });

    it("skips free tier (0 cent per meal)", () => {
      // Infant (age < 4) has 0-cent meal category
      const meals = [
        { date: "2026-06-22", mealType: "BREAKFAST" as const, selected: true },
      ];
      const result = calculateEstimate(
        makeInput({
          roomGroups: [
            makeGroup([
              makeParticipant({
                birthYear: 2024, // ~2 years old
                birthMonth: 1,
                birthDay: 1,
                mealSelections: meals,
              }),
            ]),
          ],
        })
      );
      expect(result.mealFee).toBe(0);
    });

    it("handles child age tier (4-12)", () => {
      const meals = [
        { date: "2026-06-22", mealType: "BREAKFAST" as const, selected: true },
        { date: "2026-06-22", mealType: "LUNCH" as const, selected: true },
        { date: "2026-06-22", mealType: "DINNER" as const, selected: true },
      ];
      const result = calculateEstimate(
        makeInput({
          roomGroups: [
            makeGroup([
              makeParticipant({
                birthYear: 2018, // ~8 years old at event
                birthMonth: 1,
                birthDay: 1,
                mealSelections: meals,
              }),
            ]),
          ],
        })
      );
      // Child: min(700 day, 3×300=900) = 700
      expect(result.mealFee).toBe(700);
    });

    it("handles no matching meal category", () => {
      const meals = [
        { date: "2026-06-22", mealType: "BREAKFAST" as const, selected: true },
      ];
      const result = calculateEstimate(
        makeInput({
          mealFeeCategories: [], // no categories
          roomGroups: [
            makeGroup([makeParticipant({ mealSelections: meals })]),
          ],
        })
      );
      expect(result.mealFee).toBe(0);
    });
  });

  describe("VBS materials fee", () => {
    it("charges VBS fee for children in VBS departments", () => {
      const result = calculateEstimate(
        makeInput({
          roomGroups: [
            makeGroup([
              makeParticipant({
                departmentId: "dept-vbs-1",
                birthYear: 2020,
              }),
            ]),
          ],
        })
      );
      expect(result.vbsFee).toBe(500); // 1 × $5
    });

    it("does not charge for non-VBS departments", () => {
      const result = calculateEstimate(
        makeInput({
          roomGroups: [
            makeGroup([
              makeParticipant({ departmentId: "dept-worship" }),
            ]),
          ],
        })
      );
      expect(result.vbsFee).toBe(0);
    });

    it("does not charge when vbsMaterialsFeeCents is 0", () => {
      const result = calculateEstimate(
        makeInput({
          vbsMaterialsFeeCents: 0,
          roomGroups: [
            makeGroup([
              makeParticipant({ departmentId: "dept-vbs-1" }),
            ]),
          ],
        })
      );
      expect(result.vbsFee).toBe(0);
    });
  });

  describe("manual payment discount", () => {
    it("calculates discount as perPerson × billable participants", () => {
      const result = calculateEstimate(
        makeInput({
          manualPaymentDiscountPerPerson: 500,
          roomGroups: [
            makeGroup([makeParticipant(), makeParticipant({ id: "p2" })]),
          ],
        })
      );
      expect(result.manualPaymentDiscount).toBe(1000); // 2 × $5
    });

    it("is zero when no discount configured", () => {
      const result = calculateEstimate(makeInput());
      expect(result.manualPaymentDiscount).toBe(0);
    });

    it("is NOT subtracted from total (informational only)", () => {
      const result = calculateEstimate(
        makeInput({ manualPaymentDiscountPerPerson: 500 })
      );
      // total should not be reduced by discount
      expect(result.total).toBe(result.subtotal + result.keyDeposit);
    });

    it("only counts age-eligible participants for discount", () => {
      // 1 adult (eligible) + 1 infant age 2 (not eligible with age_min=5)
      const result = calculateEstimate(
        makeInput({
          manualPaymentDiscountPerPerson: 500,
          regFeeAgeMin: 5,
          roomGroups: [
            makeGroup([
              makeParticipant({ id: "adult", birthYear: 1990 }),
              makeParticipant({ id: "infant", birthYear: 2024, birthMonth: 1, birthDay: 1 }),
            ]),
          ],
        })
      );
      // Only 1 participant is billable → discount = 1 × $5
      expect(result.manualPaymentDiscount).toBe(500);
    });

    it("is zero when registration fee is zero (no billable participants)", () => {
      const result = calculateEstimate(
        makeInput({
          registrationFeePerPerson: 0,
          manualPaymentDiscountPerPerson: 500,
        })
      );
      expect(result.manualPaymentDiscount).toBe(0);
    });
  });

  describe("totals", () => {
    it("subtotal = registrationFee + lodgingFee + additionalLodgingFee + mealFee + vbsFee", () => {
      const result = calculateEstimate(makeInput());
      expect(result.subtotal).toBe(
        result.registrationFee +
          result.lodgingFee +
          result.additionalLodgingFee +
          result.mealFee +
          result.vbsFee
      );
    });

    it("total = subtotal + keyDeposit", () => {
      const result = calculateEstimate(makeInput());
      expect(result.total).toBe(result.subtotal + result.keyDeposit);
    });

    it("breakdown items sum to subtotal + keyDeposit", () => {
      const result = calculateEstimate(makeInput());
      const breakdownTotal = result.breakdown.reduce(
        (sum, item) => sum + item.amount,
        0
      );
      expect(breakdownTotal).toBe(result.total);
    });
  });

  describe("waived display — applyGeneralFeesToMembers=false", () => {
    it("shows waived line for representative when group fee is $0", () => {
      // Non-default group: rep fee = $0, non-rep pays default $100
      const rep = makeParticipant({ id: "rep", isRepresentative: true });
      const member = makeParticipant({ id: "m1", isRepresentative: false });

      const result = calculateEstimate(
        makeInput({
          registrationFeePerPerson: 0, // group fee = $0
          earlyBirdFeePerPerson: null,
          applyGeneralFeesToMembers: false,
          roomGroups: [makeGroup([rep, member])],
        })
      );

      // Representative's fee should appear as waived
      const waivedLines = result.breakdown.filter(
        (b) => b.description === "Registration Fee (Waived)"
      );
      expect(waivedLines.length).toBe(1);
      expect(waivedLines[0].quantity).toBe(1);
      expect(waivedLines[0].amount).toBe(0);

      // Non-rep member pays default $100
      const paidLines = result.breakdown.filter(
        (b) => b.category === "registration" && b.amount > 0
      );
      expect(paidLines.length).toBe(1);
      expect(paidLines[0].amount).toBe(10000);
    });

    it("shows waived line for access-code members with $0 fee", () => {
      const rep = makeParticipant({ id: "rep", isRepresentative: true });
      const member = makeParticipant({
        id: "m1",
        isRepresentative: false,
        memberRegistrationGroupId: "group-special",
      });

      const result = calculateEstimate(
        makeInput({
          registrationFeePerPerson: 5000, // rep pays $50
          earlyBirdFeePerPerson: null,
          applyGeneralFeesToMembers: false,
          memberGroupFees: {
            "group-special": {
              registrationFee: 0,
              earlyBirdFee: null,
              isEarlyBird: false,
              mealFeeCategories: [],
              manualPaymentDiscountPerPerson: 0,
              regFeeAgeMin: null,
              regFeeAgeMax: null,
              earlyBirdAgeMin: null,
              earlyBirdAgeMax: null,
            },
          },
          roomGroups: [makeGroup([rep, member])],
        })
      );

      // Rep pays $50
      const repLine = result.breakdown.find(
        (b) => b.category === "registration" && b.amount > 0
      );
      expect(repLine).toBeDefined();
      expect(repLine!.amount).toBe(5000);

      // Access-code member shows waived
      const waivedLines = result.breakdown.filter(
        (b) => b.description === "Registration Fee (Waived)"
      );
      expect(waivedLines.length).toBe(1);
    });

    it("shows waived for rep + access-code member both $0", () => {
      const rep = makeParticipant({ id: "rep", isRepresentative: true });
      const member = makeParticipant({
        id: "m1",
        isRepresentative: false,
        memberRegistrationGroupId: "group-free",
      });

      const result = calculateEstimate(
        makeInput({
          registrationFeePerPerson: 0, // rep group fee $0
          earlyBirdFeePerPerson: null,
          applyGeneralFeesToMembers: false,
          memberGroupFees: {
            "group-free": {
              registrationFee: 0,
              earlyBirdFee: null,
              isEarlyBird: false,
              mealFeeCategories: [],
              manualPaymentDiscountPerPerson: 0,
              regFeeAgeMin: null,
              regFeeAgeMax: null,
              earlyBirdAgeMin: null,
              earlyBirdAgeMax: null,
            },
          },
          roomGroups: [makeGroup([rep, member])],
        })
      );

      // Both should show as waived
      const waivedLines = result.breakdown.filter(
        (b) => b.description === "Registration Fee (Waived)"
      );
      expect(waivedLines.length).toBe(2); // rep + access-code member
      expect(result.registrationFee).toBe(0);
    });
  });

  describe("computeWaivedBenefits", () => {
    function makeEstimate(overrides: Partial<PriceEstimate> = {}): PriceEstimate {
      return {
        registrationFee: 0,
        lodgingFee: 0,
        additionalLodgingFee: 0,
        mealFee: 0,
        vbsFee: 0,
        keyDeposit: 0,
        subtotal: 0,
        total: 0,
        breakdown: [],
        participantBreakdown: {},
        manualPaymentDiscount: 0,
        fundingDiscount: 0,
        ...overrides,
      };
    }

    it("adds waived lines when current=0 and default>0", () => {
      const current = makeEstimate({ registrationFee: 0 });
      const defaultEst = makeEstimate({
        registrationFee: 10000,
        breakdown: [
          {
            description: "Registration Fee",
            descriptionKo: "등록비",
            quantity: 1,
            unitPrice: 10000,
            amount: 10000,
            category: "registration",
          },
        ],
      });

      const waived = computeWaivedBenefits(current, defaultEst);
      expect(waived.length).toBe(1);
      expect(waived[0].description).toBe("Registration Fee (Waived)");
      expect(waived[0].amount).toBe(0);
    });

    it("skips category when current breakdown already has items", () => {
      // Scenario: calculateEstimate already added a "(Waived)" line for registration
      const current = makeEstimate({
        registrationFee: 0,
        breakdown: [
          {
            description: "Registration Fee (Waived)",
            descriptionKo: "등록비 (면제)",
            quantity: 1,
            unitPrice: 0,
            amount: 0,
            category: "registration",
          },
        ],
      });
      const defaultEst = makeEstimate({
        registrationFee: 10000,
        breakdown: [
          {
            description: "Registration Fee",
            descriptionKo: "등록비",
            quantity: 1,
            unitPrice: 10000,
            amount: 10000,
            category: "registration",
          },
        ],
      });

      const waived = computeWaivedBenefits(current, defaultEst);
      // Should NOT add duplicate waived lines
      expect(waived.length).toBe(0);
    });

    it("does not add waived when current > 0", () => {
      const current = makeEstimate({ registrationFee: 5000 });
      const defaultEst = makeEstimate({ registrationFee: 10000 });

      const waived = computeWaivedBenefits(current, defaultEst);
      expect(waived.length).toBe(0);
    });

    it("handles multiple categories independently", () => {
      const current = makeEstimate({
        registrationFee: 0,
        lodgingFee: 5000, // not waived (has cost)
        mealFee: 0,
      });
      const defaultEst = makeEstimate({
        registrationFee: 10000,
        lodgingFee: 10000,
        mealFee: 3000,
        breakdown: [
          {
            description: "Registration Fee",
            descriptionKo: "등록비",
            quantity: 1,
            unitPrice: 10000,
            amount: 10000,
            category: "registration",
          },
          {
            description: "Lodging",
            descriptionKo: "숙박비",
            quantity: 7,
            unitPrice: 1000,
            amount: 10000,
            category: "lodging",
          },
          {
            description: "Meals",
            descriptionKo: "식사",
            quantity: 1,
            unitPrice: 3000,
            amount: 3000,
            category: "meal",
          },
        ],
      });

      const waived = computeWaivedBenefits(current, defaultEst);
      // Only registration and meal should be waived (lodging has cost)
      expect(waived.length).toBe(2);
      expect(waived.map((w) => w.description)).toEqual([
        "Registration Fee (Waived)",
        "Meals (Waived)",
      ]);
    });
  });
});
