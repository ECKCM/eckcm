import type { PriceEstimate, PriceLineItem, RoomGroupInput } from "@/lib/types/registration";
import { calculateAge } from "@/lib/utils/validators";

export interface LodgingRate {
  code: string;
  name_en: string;
  pricing_type: string; // "PER_NIGHT" | "FLAT"
  amount_cents: number;
}

export interface MealFeeCategory {
  code: string;
  name_en: string;
  pricing_type: string; // "PER_MEAL" | "FLAT"
  amount_cents: number;
  age_min: number | null;
  age_max: number | null;
}

interface PricingInput {
  nightsCount: number;
  roomGroups: RoomGroupInput[];
  registrationFeePerPerson: number; // cents
  earlyBirdFeePerPerson: number | null; // cents
  isEarlyBird: boolean;
  keyDepositPerKey: number; // cents
  additionalLodgingThreshold: number;
  additionalLodgingFeePerNight: number; // cents
  lodgingRates: LodgingRate[]; // available lodging fee categories
  mealFeeCategories: MealFeeCategory[]; // MEAL_* fee categories with age ranges
  eventStartDate: string; // YYYY-MM-DD for age calculation
}

export function calculateEstimate(input: PricingInput): PriceEstimate {
  const breakdown: PriceLineItem[] = [];
  let registrationFee = 0;
  let lodgingFee = 0;
  let additionalLodgingFee = 0;
  let keyDeposit = 0;

  const totalParticipants = input.roomGroups.reduce(
    (sum, g) => sum + g.participants.length,
    0
  );

  // 1. Registration Fee per person
  const feePerPerson =
    input.isEarlyBird && input.earlyBirdFeePerPerson != null
      ? input.earlyBirdFeePerPerson
      : input.registrationFeePerPerson;

  if (feePerPerson > 0) {
    registrationFee = feePerPerson * totalParticipants;
    breakdown.push({
      description: input.isEarlyBird
        ? "Registration Fee (Early Bird)"
        : "Registration Fee",
      descriptionKo: input.isEarlyBird ? "등록비 (얼리버드)" : "등록비",
      quantity: totalParticipants,
      unitPrice: feePerPerson,
      amount: registrationFee,
    });
  }

  // 2. Lodging fee per room group
  for (let gi = 0; gi < input.roomGroups.length; gi++) {
    const group = input.roomGroups[gi];
    const rate = input.lodgingRates.find((r) => r.code === group.lodgingType);
    if (rate && rate.amount_cents > 0) {
      const groupLodging =
        rate.pricing_type === "PER_NIGHT"
          ? rate.amount_cents * input.nightsCount
          : rate.amount_cents;
      lodgingFee += groupLodging;
      breakdown.push({
        description:
          rate.pricing_type === "PER_NIGHT"
            ? `Group ${gi + 1}: ${rate.name_en} (${input.nightsCount} nights)`
            : `Group ${gi + 1}: ${rate.name_en}`,
        descriptionKo: `그룹 ${gi + 1}: 숙박비`,
        quantity: rate.pricing_type === "PER_NIGHT" ? input.nightsCount : 1,
        unitPrice: rate.amount_cents,
        amount: groupLodging,
      });
    }
  }

  // 3. Additional lodging fee if group exceeds threshold
  for (let gi = 0; gi < input.roomGroups.length; gi++) {
    const group = input.roomGroups[gi];
    if (group.participants.length > input.additionalLodgingThreshold) {
      const extraPeople =
        group.participants.length - input.additionalLodgingThreshold;
      const extraFee =
        extraPeople *
        input.nightsCount *
        input.additionalLodgingFeePerNight;
      additionalLodgingFee += extraFee;
      breakdown.push({
        description: `Group ${gi + 1}: Additional Lodging (${extraPeople} extra × ${input.nightsCount} nights)`,
        descriptionKo: `그룹 ${gi + 1}: 추가 숙박비`,
        quantity: extraPeople * input.nightsCount,
        unitPrice: input.additionalLodgingFeePerNight,
        amount: extraFee,
      });
    }
  }

  // 4. Key Deposit
  const totalKeys = input.roomGroups.reduce(
    (sum, g) => sum + g.keyCount,
    0
  );
  if (totalKeys > 0 && input.keyDepositPerKey > 0) {
    keyDeposit = totalKeys * input.keyDepositPerKey;
    breakdown.push({
      description: "Key Deposit",
      descriptionKo: "키 보증금",
      quantity: totalKeys,
      unitPrice: input.keyDepositPerKey,
      amount: keyDeposit,
    });
  }

  // 5. Meal fees per participant (matched by fee category age_min/age_max)
  let mealFee = 0;
  if (input.mealFeeCategories.length > 0) {
    const eventStart = new Date(input.eventStartDate + "T00:00:00");

    const matchAge = (cat: MealFeeCategory, age: number) =>
      (cat.age_min == null || age >= cat.age_min) &&
      (cat.age_max == null || age <= cat.age_max);

    for (const group of input.roomGroups) {
      for (const participant of group.participants) {
        const birthDate = new Date(
          participant.birthYear,
          participant.birthMonth - 1,
          participant.birthDay
        );
        const age = calculateAge(birthDate, eventStart);

        // Find matching PER_MEAL category for this age
        const perMealCat = input.mealFeeCategories.find(
          (c) => c.pricing_type === "PER_MEAL" && matchAge(c, age)
        );
        // Find matching FLAT (full-day) category for this age
        const fullDayCat = input.mealFeeCategories.find(
          (c) => c.pricing_type === "FLAT" && matchAge(c, age)
        );

        if (!perMealCat) continue; // no matching category
        if (perMealCat.amount_cents === 0) continue; // free tier

        const priceEach = perMealCat.amount_cents;
        const priceDay = fullDayCat?.amount_cents ?? priceEach * 3;
        const tierLabel = perMealCat.name_en.replace("Meal - ", "");

        // Group selected meals by date
        const selectedByDate = new Map<string, number>();
        for (const sel of participant.mealSelections) {
          if (!sel.selected) continue;
          selectedByDate.set(
            sel.date,
            (selectedByDate.get(sel.date) ?? 0) + 1
          );
        }

        let participantMealTotal = 0;
        let totalMealCount = 0;
        let fullDayCount = 0;

        for (const [, mealCount] of selectedByDate) {
          if (mealCount === 3) {
            const dayCost = Math.min(priceDay, 3 * priceEach);
            participantMealTotal += dayCost;
            fullDayCount++;
          } else {
            participantMealTotal += mealCount * priceEach;
            totalMealCount += mealCount;
          }
        }

        if (participantMealTotal > 0) {
          mealFee += participantMealTotal;
          const name = `${participant.firstName} ${participant.lastName}`;
          const parts: string[] = [];
          if (fullDayCount > 0) parts.push(`${fullDayCount} full day(s)`);
          if (totalMealCount > 0) parts.push(`${totalMealCount} meal(s)`);

          breakdown.push({
            description: `Meals - ${name} (${tierLabel}, ${parts.join(" + ")})`,
            descriptionKo: `식사 - ${name} (${tierLabel})`,
            quantity: 1,
            unitPrice: participantMealTotal,
            amount: participantMealTotal,
          });
        }
      }
    }
  }

  const subtotal = registrationFee + lodgingFee + additionalLodgingFee + mealFee;
  const total = subtotal + keyDeposit;

  return {
    registrationFee,
    lodgingFee,
    additionalLodgingFee,
    mealFee,
    vbsFee: 0,
    keyDeposit,
    subtotal,
    total,
    breakdown,
  };
}
