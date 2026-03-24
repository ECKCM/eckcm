import type { PriceEstimate, PriceLineItem, RoomGroupInput } from "@/lib/types/registration";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateAge } from "@/lib/utils/validators";
import { INFANT_AGE_THRESHOLD } from "@/lib/utils/constants";

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
  vbsMaterialsFeeCents: number; // per-child VBS materials fee (0 if not applicable)
  vbsDepartmentIds: string[]; // IDs of VBS departments
  manualPaymentDiscountPerPerson: number; // cents — MANUAL_PAYMENT_DISCOUNT per person (0 if none)
  // Fee Application Scope: when OFF, non-representative members use default group fees
  applyGeneralFeesToMembers: boolean;
  applyMealFeesToMembers: boolean;
  defaultRegistrationFeePerPerson: number; // cents — from default group
  defaultEarlyBirdFeePerPerson: number | null; // cents — from default group
  defaultIsEarlyBird: boolean;
  defaultMealFeeCategories: MealFeeCategory[]; // from default group
  defaultManualPaymentDiscountPerPerson: number; // from default group
  // Per-member group fees: when a member has their own access code (memberRegistrationGroupId),
  // use that group's fees instead of the default group's fees
  memberGroupFees?: Record<string, MemberGroupFees>;
}

export interface MemberGroupFees {
  registrationFee: number; // cents
  earlyBirdFee: number | null; // cents
  isEarlyBird: boolean;
  mealFeeCategories: MealFeeCategory[];
  manualPaymentDiscountPerPerson: number;
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

  if (input.applyGeneralFeesToMembers) {
    // All participants pay the group's registration fee
    if (feePerPerson > 0) {
      registrationFee = feePerPerson * totalParticipants;
      breakdown.push({
        description: input.isEarlyBird ? "Registration Fee (Early Bird)" : "Registration Fee",
        descriptionKo: input.isEarlyBird ? "등록비 (얼리버드)" : "등록비",
        quantity: totalParticipants,
        unitPrice: feePerPerson,
        amount: registrationFee,
        category: "registration",
      });
    }
  } else {
    // Representative pays group fee, others pay default OR their own member-group fee
    const mgf = input.memberGroupFees ?? {};

    // Collect non-representative participants by fee source
    const defaultFee =
      input.defaultIsEarlyBird && input.defaultEarlyBirdFeePerPerson != null
        ? input.defaultEarlyBirdFeePerPerson
        : input.defaultRegistrationFeePerPerson;

    // Representative always pays main group fee
    if (feePerPerson > 0) {
      registrationFee += feePerPerson;
      breakdown.push({
        description: input.isEarlyBird ? "Registration Fee (Early Bird)" : "Registration Fee",
        descriptionKo: input.isEarlyBird ? "등록비 (얼리버드)" : "등록비",
        quantity: 1,
        unitPrice: feePerPerson,
        amount: feePerPerson,
        category: "registration",
      });
    }

    // Group non-representative members by their fee source (member group or default)
    const feeGroups = new Map<string, { fee: number; isEB: boolean; count: number }>();
    for (const group of input.roomGroups) {
      for (const p of group.participants) {
        if (p.isRepresentative) continue;
        const mGroupId = p.memberRegistrationGroupId;
        if (mGroupId && mgf[mGroupId]) {
          const mg = mgf[mGroupId];
          const mFee = mg.isEarlyBird && mg.earlyBirdFee != null ? mg.earlyBirdFee : mg.registrationFee;
          const key = `mg:${mGroupId}`;
          const entry = feeGroups.get(key);
          if (entry) { entry.count++; } else { feeGroups.set(key, { fee: mFee, isEB: mg.isEarlyBird, count: 1 }); }
        } else {
          const key = "default";
          const entry = feeGroups.get(key);
          if (entry) { entry.count++; } else { feeGroups.set(key, { fee: defaultFee, isEB: input.defaultIsEarlyBird, count: 1 }); }
        }
      }
    }

    for (const [key, { fee, isEB, count }] of feeGroups) {
      if (fee > 0) {
        registrationFee += fee * count;
        breakdown.push({
          description: isEB ? "Registration Fee (Early Bird)" : "Registration Fee",
          descriptionKo: isEB ? "등록비 (얼리버드)" : "등록비",
          quantity: count,
          unitPrice: fee,
          amount: fee * count,
          category: "registration",
        });
      } else if (key.startsWith("mg:")) {
        // Access code member with $0 registration fee — show as waived
        breakdown.push({
          description: "Registration Fee (Waived)",
          descriptionKo: "등록비 (면제)",
          quantity: count,
          unitPrice: 0,
          amount: 0,
          category: "registration",
        });
      }
    }
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
        category: "lodging",
      });
    }
  }

  // 3. Additional lodging fee if group exceeds threshold
  //    Infants (age < INFANT_AGE_THRESHOLD) are exempt from the extra fee
  const eventStart = new Date(input.eventStartDate + "T00:00:00");
  for (let gi = 0; gi < input.roomGroups.length; gi++) {
    const group = input.roomGroups[gi];
    // Count only non-infant participants for extra lodging calculation
    const billableCount = group.participants.filter((p) => {
      const birthDate = new Date(
        p.birthYear ?? 2000,
        (p.birthMonth ?? 1) - 1,
        p.birthDay ?? 1
      );
      return calculateAge(birthDate, eventStart) >= INFANT_AGE_THRESHOLD;
    }).length;

    if (billableCount > input.additionalLodgingThreshold) {
      const extraPeople = billableCount - input.additionalLodgingThreshold;
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
        category: "additional_lodging",
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
      category: "key_deposit",
    });
  }

  // 5. Meal fees per participant (matched by fee category age_min/age_max)
  //    When applyMealFeesToMembers=false, only representative uses group meal fees;
  //    other members use default group's meal fees.
  let mealFee = 0;
  const groupMealCats = input.mealFeeCategories;
  const defaultMealCats = input.defaultMealFeeCategories;
  const hasAnyMealCats = groupMealCats.length > 0 || defaultMealCats.length > 0;

  if (hasAnyMealCats) {
    const matchAge = (cat: MealFeeCategory, age: number) =>
      (cat.age_min == null || age >= cat.age_min) &&
      (cat.age_max == null || age <= cat.age_max);

    for (const group of input.roomGroups) {
      for (const participant of group.participants) {
        // Choose meal categories: representative uses group's, others use member-group or default's (if toggle OFF)
        let mealCats: MealFeeCategory[];
        if (input.applyMealFeesToMembers || participant.isRepresentative) {
          mealCats = groupMealCats;
        } else {
          const mGroupId = participant.memberRegistrationGroupId;
          const mgf = input.memberGroupFees ?? {};
          mealCats = (mGroupId && mgf[mGroupId]) ? mgf[mGroupId].mealFeeCategories : defaultMealCats;
        }
        if (mealCats.length === 0) continue;
        const birthDate = new Date(
          participant.birthYear ?? 2000,
          (participant.birthMonth ?? 1) - 1,
          participant.birthDay ?? 1
        );
        const age = calculateAge(birthDate, eventStart);

        // Find matching PER_MEAL category for this age
        const perMealCat = mealCats.find(
          (c) => c.pricing_type === "PER_MEAL" && matchAge(c, age)
        );
        // Find matching FLAT (full-day) category for this age
        const fullDayCat = mealCats.find(
          (c) => c.pricing_type === "FLAT" && matchAge(c, age)
        );

        if (!perMealCat) continue; // no matching category
        if (perMealCat.amount_cents === 0) {
          // $0 meal fee — show as Free (e.g., infants matched to MEAL_FREE)
          const selectedCount = participant.mealSelections.filter((s) => s.selected).length;
          if (selectedCount > 0) {
            const name = `${participant.firstName} ${participant.lastName}`;
            const tierLabel = perMealCat.name_en.replace("Meal - ", "");
            breakdown.push({
              description: `Meals - ${name} (${tierLabel}, Free)`,
              descriptionKo: `식사 - ${name} (${tierLabel}, 무료)`,
              quantity: selectedCount,
              unitPrice: 0,
              amount: 0,
              category: "meal",
            });
          }
          continue;
        }

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

          // Full-day meals as quantity × unit price
          if (fullDayCount > 0) {
            const dayCost = Math.min(priceDay, 3 * priceEach);
            breakdown.push({
              description: `Meals - ${name} (${tierLabel}, Full Day)`,
              descriptionKo: `식사 - ${name} (${tierLabel}, 종일)`,
              quantity: fullDayCount,
              unitPrice: dayCost,
              amount: fullDayCount * dayCost,
              category: "meal",
            });
          }

          // Partial meals as quantity × per-meal price
          if (totalMealCount > 0) {
            breakdown.push({
              description: `Meals - ${name} (${tierLabel}, Partial)`,
              descriptionKo: `식사 - ${name} (${tierLabel}, 부분)`,
              quantity: totalMealCount,
              unitPrice: priceEach,
              amount: totalMealCount * priceEach,
              category: "meal",
            });
          }
        }
      }
    }
  }

  // 6. VBS Materials fee per child registered for VBS department
  let vbsFee = 0;
  if (input.vbsMaterialsFeeCents > 0 && input.vbsDepartmentIds.length > 0) {
    const vbsCount = input.roomGroups.reduce(
      (sum, g) =>
        sum +
        g.participants.filter(
          (p) => p.departmentId && input.vbsDepartmentIds.includes(p.departmentId)
        ).length,
      0
    );
    if (vbsCount > 0) {
      vbsFee = vbsCount * input.vbsMaterialsFeeCents;
      breakdown.push({
        description: `VBS Materials (${vbsCount} child${vbsCount > 1 ? "ren" : ""})`,
        descriptionKo: `VBS 교재비 (${vbsCount}명)`,
        quantity: vbsCount,
        unitPrice: input.vbsMaterialsFeeCents,
        amount: vbsFee,
        category: "vbs",
      });
    }
  }

  const subtotal = registrationFee + lodgingFee + additionalLodgingFee + mealFee + vbsFee;
  const total = subtotal + keyDeposit;

  // 7. Manual payment discount (informational — not subtracted from total)
  const manualPaymentDiscount =
    input.manualPaymentDiscountPerPerson > 0
      ? input.manualPaymentDiscountPerPerson * totalParticipants
      : 0;

  return {
    registrationFee,
    lodgingFee,
    additionalLodgingFee,
    mealFee,
    vbsFee,
    keyDeposit,
    subtotal,
    total,
    breakdown,
    manualPaymentDiscount,
  };
}

/**
 * Remap room groups' lodging types to match the default group's available lodging codes.
 * E.g., LODGING_AC_VIP → LODGING_AC (longest prefix match in default rates).
 */
export function remapLodgingForDefault(
  roomGroups: RoomGroupInput[],
  defaultLodgingRates: LodgingRate[],
): RoomGroupInput[] {
  if (defaultLodgingRates.length === 0) return roomGroups;
  const sorted = [...defaultLodgingRates].sort((a, b) => b.code.length - a.code.length);
  return roomGroups.map((g) => {
    if (!g.lodgingType) return g;
    // Exact match — no remapping needed
    if (defaultLodgingRates.some((r) => r.code === g.lodgingType)) return g;
    // Find longest prefix match
    for (const rate of sorted) {
      if (g.lodgingType.startsWith(rate.code)) {
        return { ...g, lodgingType: rate.code };
      }
    }
    return g;
  });
}

/**
 * Compare current estimate vs what the default group would charge.
 * For each category where current = $0 but default > $0, return the
 * default's breakdown items as "(Waived)" line items.
 */
export function computeWaivedBenefits(
  current: PriceEstimate,
  defaultEst: PriceEstimate,
): PriceLineItem[] {
  const waived: PriceLineItem[] = [];
  const categories: { cat: NonNullable<PriceLineItem["category"]>; ct: number; dt: number }[] = [
    { cat: "registration", ct: current.registrationFee, dt: defaultEst.registrationFee },
    { cat: "lodging", ct: current.lodgingFee, dt: defaultEst.lodgingFee },
    { cat: "additional_lodging", ct: current.additionalLodgingFee, dt: defaultEst.additionalLodgingFee },
    { cat: "key_deposit", ct: current.keyDeposit, dt: defaultEst.keyDeposit },
    { cat: "meal", ct: current.mealFee, dt: defaultEst.mealFee },
    { cat: "vbs", ct: current.vbsFee, dt: defaultEst.vbsFee },
  ];

  for (const { cat, ct, dt } of categories) {
    if (ct === 0 && dt > 0) {
      for (const item of defaultEst.breakdown) {
        if (item.category !== cat) continue;
        waived.push({
          description: `${item.description} (Waived)`,
          descriptionKo: `${item.descriptionKo} (면제)`,
          quantity: item.quantity,
          unitPrice: 0,
          amount: 0,
        });
      }
    }
  }

  return waived;
}

/**
 * Load fee data for each unique memberRegistrationGroupId found in participants.
 * Returns a map of groupId → MemberGroupFees for use in calculateEstimate.
 */
export async function loadMemberGroupFees(
  supabase: SupabaseClient,
  roomGroups: RoomGroupInput[],
  eventEarlyDates?: { early_registration_start: string | null; early_registration_end: string | null } | null,
): Promise<Record<string, MemberGroupFees>> {
  const memberGroupIds = new Set<string>();
  for (const g of roomGroups) {
    for (const p of g.participants) {
      if (!p.isRepresentative && p.memberRegistrationGroupId) {
        memberGroupIds.add(p.memberRegistrationGroupId);
      }
    }
  }

  if (memberGroupIds.size === 0) return {};

  const result: Record<string, MemberGroupFees> = {};

  for (const groupId of memberGroupIds) {
    const [{ data: grp }, { data: feeLinks }] = await Promise.all([
      supabase
        .from("eckcm_registration_groups")
        .select("global_registration_fee_cents, global_early_bird_fee_cents, early_bird_deadline")
        .eq("id", groupId)
        .single(),
      supabase
        .from("eckcm_registration_group_fee_categories")
        .select("eckcm_fee_categories!inner(code, name_en, pricing_type, amount_cents, age_min, age_max)")
        .eq("registration_group_id", groupId),
    ]);

    if (!grp) continue;

    const linked = (feeLinks ?? []).map((row: any) => row.eckcm_fee_categories);
    const regFeeCat = linked.find((f: any) => f.code === "REG_FEE");
    const earlyBirdCat = linked.find((f: any) => f.code === "EARLY_BIRD");
    const manualDiscount = linked.find((f: any) => f.code === "MANUAL_PAYMENT_DISCOUNT");

    const effDeadline = grp.early_bird_deadline ?? eventEarlyDates?.early_registration_end ?? null;
    const effStart = eventEarlyDates?.early_registration_start ?? null;
    const now = new Date();

    result[groupId] = {
      registrationFee: grp.global_registration_fee_cents ?? regFeeCat?.amount_cents ?? 0,
      earlyBirdFee: grp.global_early_bird_fee_cents ?? earlyBirdCat?.amount_cents ?? null,
      isEarlyBird: effDeadline != null && now < new Date(effDeadline) && (effStart == null || now >= new Date(effStart)),
      mealFeeCategories: linked.filter((f: any) => f.code.startsWith("MEAL_")),
      manualPaymentDiscountPerPerson: manualDiscount?.amount_cents ?? 0,
    };
  }

  return result;
}
