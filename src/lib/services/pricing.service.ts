import type { PriceEstimate, PriceLineItem, RoomGroupInput } from "@/lib/types/registration";

interface PricingInput {
  nightsCount: number;
  roomGroups: RoomGroupInput[];
  registrationFeePerPerson: number; // cents
  earlyBirdFeePerPerson: number | null; // cents
  isEarlyBird: boolean;
  keyDepositPerKey: number; // cents
  additionalLodgingThreshold: number;
  additionalLodgingFeePerNight: number; // cents
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

  // 2. Additional lodging fee if group exceeds threshold
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

  // 3. Key Deposit
  const totalKeys = input.roomGroups.reduce(
    (sum, g) => sum + g.keyCount,
    0
  );
  if (totalKeys > 0 && input.keyDepositPerKey > 0) {
    keyDeposit = totalKeys * input.keyDepositPerKey;
    breakdown.push({
      description: "Key Deposit (refundable)",
      descriptionKo: "키 보증금 (환불 가능)",
      quantity: totalKeys,
      unitPrice: input.keyDepositPerKey,
      amount: keyDeposit,
    });
  }

  const subtotal = registrationFee + lodgingFee + additionalLodgingFee;
  const total = subtotal + keyDeposit;

  return {
    registrationFee,
    lodgingFee,
    additionalLodgingFee,
    mealFee: 0, // meals calculated separately in Phase 9
    vbsFee: 0,
    keyDeposit,
    subtotal,
    total,
    breakdown,
  };
}
