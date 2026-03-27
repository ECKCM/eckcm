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
  // Age bounds from REG_FEE/EARLY_BIRD fee categories (null = no restriction)
  regFeeAgeMin: number | null;
  regFeeAgeMax: number | null;
  earlyBirdAgeMin: number | null;
  earlyBirdAgeMax: number | null;
  defaultRegFeeAgeMin: number | null;
  defaultRegFeeAgeMax: number | null;
  defaultEarlyBirdAgeMin: number | null;
  defaultEarlyBirdAgeMax: number | null;
  // Per-member group fees: when a member has their own access code (memberRegistrationGroupId),
  // use that group's fees instead of the default group's fees
  memberGroupFees?: Record<string, MemberGroupFees>;
  // Funding discounts from FUNDING fee categories targeting this registration group
  fundingDiscounts?: { feeCategoryId: string; name: string; nameKo: string; amountCents: number }[];
}

export interface MemberGroupFees {
  registrationFee: number; // cents
  earlyBirdFee: number | null; // cents
  isEarlyBird: boolean;
  mealFeeCategories: MealFeeCategory[];
  manualPaymentDiscountPerPerson: number;
  regFeeAgeMin: number | null;
  regFeeAgeMax: number | null;
  earlyBirdAgeMin: number | null;
  earlyBirdAgeMax: number | null;
}

function isAgeEligible(ageMin: number | null, ageMax: number | null, age: number): boolean {
  return (ageMin == null || age >= ageMin) && (ageMax == null || age <= ageMax);
}

export function calculateEstimate(input: PricingInput): PriceEstimate {
  const breakdown: PriceLineItem[] = [];
  const participantBreakdown: Record<string, PriceLineItem[]> = {};
  let registrationFee = 0;
  let lodgingFee = 0;
  let additionalLodgingFee = 0;
  let keyDeposit = 0;

  // Initialize per-participant breakdown
  for (const group of input.roomGroups) {
    for (const p of group.participants) {
      participantBreakdown[p.id] = [];
    }
  }

  const totalParticipants = input.roomGroups.reduce(
    (sum, g) => sum + g.participants.length,
    0
  );

  // 1. Registration Fee per person (with age-based eligibility)
  const eventStart = new Date(input.eventStartDate + "T00:00:00");
  const feePerPerson =
    input.isEarlyBird && input.earlyBirdFeePerPerson != null
      ? input.earlyBirdFeePerPerson
      : input.registrationFeePerPerson;

  let registrationFeeBillableCount = 0;

  if (input.applyGeneralFeesToMembers) {
    // Determine age bounds for the active fee category
    const ageMin = input.isEarlyBird && input.earlyBirdFeePerPerson != null
      ? input.earlyBirdAgeMin : input.regFeeAgeMin;
    const ageMax = input.isEarlyBird && input.earlyBirdFeePerPerson != null
      ? input.earlyBirdAgeMax : input.regFeeAgeMax;

    // All age-eligible participants pay the group's registration fee
    for (const group of input.roomGroups) {
      for (const p of group.participants) {
        const birthDate = new Date(p.birthYear ?? 2000, (p.birthMonth ?? 1) - 1, p.birthDay ?? 1);
        const age = calculateAge(birthDate, eventStart);
        const eligible = feePerPerson > 0 && isAgeEligible(ageMin, ageMax, age);

        if (eligible) {
          registrationFeeBillableCount++;
          registrationFee += feePerPerson;
          participantBreakdown[p.id].push({
            description: input.isEarlyBird ? "Registration Fee (Early Bird)" : "Registration Fee",
            descriptionKo: input.isEarlyBird ? "등록비 (얼리버드)" : "등록비",
            quantity: 1,
            unitPrice: feePerPerson,
            amount: feePerPerson,
            category: "registration",
          });
        }
      }
    }
    if (registrationFeeBillableCount > 0) {
      breakdown.push({
        description: input.isEarlyBird ? "Registration Fee (Early Bird)" : "Registration Fee",
        descriptionKo: input.isEarlyBird ? "등록비 (얼리버드)" : "등록비",
        quantity: registrationFeeBillableCount,
        unitPrice: feePerPerson,
        amount: registrationFee,
        category: "registration",
      });
    }
  } else {
    // Representative pays group fee, others pay default OR their own member-group fee
    const mgf = input.memberGroupFees ?? {};

    const defaultFee =
      input.defaultIsEarlyBird && input.defaultEarlyBirdFeePerPerson != null
        ? input.defaultEarlyBirdFeePerPerson
        : input.defaultRegistrationFeePerPerson;

    // Age bounds for main group fee
    const mainAgeMin = input.isEarlyBird && input.earlyBirdFeePerPerson != null
      ? input.earlyBirdAgeMin : input.regFeeAgeMin;
    const mainAgeMax = input.isEarlyBird && input.earlyBirdFeePerPerson != null
      ? input.earlyBirdAgeMax : input.regFeeAgeMax;

    // Age bounds for default group fee
    const defAgeMin = input.defaultIsEarlyBird && input.defaultEarlyBirdFeePerPerson != null
      ? input.defaultEarlyBirdAgeMin : input.defaultRegFeeAgeMin;
    const defAgeMax = input.defaultIsEarlyBird && input.defaultEarlyBirdFeePerPerson != null
      ? input.defaultEarlyBirdAgeMax : input.defaultRegFeeAgeMax;

    // Group non-representative members by their fee source (member group or default)
    const feeGroups = new Map<string, { fee: number; isEB: boolean; count: number }>();
    for (const group of input.roomGroups) {
      for (const p of group.participants) {
        const birthDate = new Date(p.birthYear ?? 2000, (p.birthMonth ?? 1) - 1, p.birthDay ?? 1);
        const age = calculateAge(birthDate, eventStart);

        if (p.isRepresentative) {
          const eligible = feePerPerson > 0 && isAgeEligible(mainAgeMin, mainAgeMax, age);
          if (eligible) {
            registrationFeeBillableCount++;
            registrationFee += feePerPerson;
            breakdown.push({
              description: input.isEarlyBird ? "Registration Fee (Early Bird)" : "Registration Fee",
              descriptionKo: input.isEarlyBird ? "등록비 (얼리버드)" : "등록비",
              quantity: 1,
              unitPrice: feePerPerson,
              amount: feePerPerson,
              category: "registration",
            });
          } else {
            breakdown.push({
              description: "Registration Fee (Waived)",
              descriptionKo: "등록비 (면제)",
              quantity: 1,
              unitPrice: 0,
              amount: 0,
              category: "registration",
            });
          }
          participantBreakdown[p.id].push({
            description: eligible
              ? (input.isEarlyBird ? "Registration Fee (Early Bird)" : "Registration Fee")
              : "Registration Fee (Waived)",
            descriptionKo: eligible
              ? (input.isEarlyBird ? "등록비 (얼리버드)" : "등록비")
              : "등록비 (면제)",
            quantity: 1,
            unitPrice: eligible ? feePerPerson : 0,
            amount: eligible ? feePerPerson : 0,
            category: "registration",
          });
          continue;
        }

        // Non-representative: determine fee source and age bounds
        const mGroupId = p.memberRegistrationGroupId;
        let pFee: number;
        let pIsEB: boolean;
        let pAgeMin: number | null;
        let pAgeMax: number | null;
        if (mGroupId && mgf[mGroupId]) {
          const mg = mgf[mGroupId];
          pFee = mg.isEarlyBird && mg.earlyBirdFee != null ? mg.earlyBirdFee : mg.registrationFee;
          pIsEB = mg.isEarlyBird;
          pAgeMin = mg.isEarlyBird && mg.earlyBirdFee != null ? mg.earlyBirdAgeMin : mg.regFeeAgeMin;
          pAgeMax = mg.isEarlyBird && mg.earlyBirdFee != null ? mg.earlyBirdAgeMax : mg.regFeeAgeMax;
        } else {
          pFee = defaultFee;
          pIsEB = input.defaultIsEarlyBird;
          pAgeMin = defAgeMin;
          pAgeMax = defAgeMax;
        }

        const eligible = pFee > 0 && isAgeEligible(pAgeMin, pAgeMax, age);
        if (eligible) {
          registrationFeeBillableCount++;
          const key = mGroupId && mgf[mGroupId] ? `mg:${mGroupId}` : "default";
          const entry = feeGroups.get(key);
          if (entry) { entry.count++; } else { feeGroups.set(key, { fee: pFee, isEB: pIsEB, count: 1 }); }
        } else if (pFee === 0 && mGroupId && mgf[mGroupId]) {
          // Member group with $0 fee — track for waived display
          const key = `mg:${mGroupId}`;
          const entry = feeGroups.get(key);
          if (entry) { entry.count++; } else { feeGroups.set(key, { fee: 0, isEB: pIsEB, count: 1 }); }
        }

        participantBreakdown[p.id].push({
          description: eligible
            ? (pIsEB ? "Registration Fee (Early Bird)" : "Registration Fee")
            : "Registration Fee (Waived)",
          descriptionKo: eligible
            ? (pIsEB ? "등록비 (얼리버드)" : "등록비")
            : "등록비 (면제)",
          quantity: 1,
          unitPrice: eligible ? pFee : 0,
          amount: eligible ? pFee : 0,
          category: "registration",
        });
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
      isAgeEligible(cat.age_min, cat.age_max, age);

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
            const freeItem: PriceLineItem = {
              description: `Meals - ${name} (${tierLabel}, Free)`,
              descriptionKo: `식사 - ${name} (${tierLabel}, 무료)`,
              quantity: selectedCount,
              unitPrice: 0,
              amount: 0,
              category: "meal",
            };
            breakdown.push(freeItem);
            participantBreakdown[participant.id].push(freeItem);
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
            const fullDayItem: PriceLineItem = {
              description: `Meals - ${name} (${tierLabel}, Full Day)`,
              descriptionKo: `식사 - ${name} (${tierLabel}, 종일)`,
              quantity: fullDayCount,
              unitPrice: dayCost,
              amount: fullDayCount * dayCost,
              category: "meal",
            };
            breakdown.push(fullDayItem);
            participantBreakdown[participant.id].push(fullDayItem);
          }

          // Partial meals as quantity × per-meal price
          if (totalMealCount > 0) {
            const partialItem: PriceLineItem = {
              description: `Meals - ${name} (${tierLabel}, Partial)`,
              descriptionKo: `식사 - ${name} (${tierLabel}, 부분)`,
              quantity: totalMealCount,
              unitPrice: priceEach,
              amount: totalMealCount * priceEach,
              category: "meal",
            };
            breakdown.push(partialItem);
            participantBreakdown[participant.id].push(partialItem);
          }
        }
      }
    }
  }

  // 6. VBS Materials fee per child registered for VBS department
  let vbsFee = 0;
  if (input.vbsMaterialsFeeCents > 0 && input.vbsDepartmentIds.length > 0) {
    let vbsCount = 0;
    for (const group of input.roomGroups) {
      for (const p of group.participants) {
        if (p.departmentId && input.vbsDepartmentIds.includes(p.departmentId)) {
          vbsCount++;
          participantBreakdown[p.id].push({
            description: "VBS Materials",
            descriptionKo: "VBS 교재비",
            quantity: 1,
            unitPrice: input.vbsMaterialsFeeCents,
            amount: input.vbsMaterialsFeeCents,
            category: "vbs",
          });
        }
      }
    }
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

  // 7. Funding discounts (per-registration, subtracted from total)
  let fundingDiscount = 0;
  if (input.fundingDiscounts && input.fundingDiscounts.length > 0) {
    for (const fd of input.fundingDiscounts) {
      fundingDiscount += fd.amountCents;
      breakdown.push({
        description: `Funding: ${fd.name}`,
        descriptionKo: `후원금: ${fd.nameKo}`,
        quantity: 1,
        unitPrice: -fd.amountCents,
        amount: -fd.amountCents,
        category: "funding",
      });
    }
    // Funding cannot exceed subtotal
    fundingDiscount = Math.min(fundingDiscount, subtotal);
  }

  const total = subtotal + keyDeposit - fundingDiscount;

  // 8. Manual payment discount (informational — not subtracted from total)
  //    Only counts participants who are actually charged a registration fee
  const manualPaymentDiscount =
    input.manualPaymentDiscountPerPerson > 0
      ? input.manualPaymentDiscountPerPerson * registrationFeeBillableCount
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
    participantBreakdown,
    manualPaymentDiscount,
    fundingDiscount,
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
      // Skip if current breakdown already has items for this category
      // (e.g., "Registration Fee (Waived)" lines added by calculateEstimate)
      const hasExistingItems = current.breakdown.some((item) => item.category === cat);
      if (hasExistingItems) continue;

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
      regFeeAgeMin: regFeeCat?.age_min ?? null,
      regFeeAgeMax: regFeeCat?.age_max ?? null,
      earlyBirdAgeMin: earlyBirdCat?.age_min ?? null,
      earlyBirdAgeMax: earlyBirdCat?.age_max ?? null,
    };
  }

  return result;
}

/**
 * Count participants who are actually charged a registration fee (age-eligible).
 * Used by payment routes to calculate MANUAL_PAYMENT_DISCOUNT correctly.
 */
export async function getRegistrationFeeBillableCount(
  supabase: SupabaseClient,
  registrationId: string,
): Promise<number> {
  // 1. Load registration → group + event
  const { data: reg } = await supabase
    .from("eckcm_registrations")
    .select("registration_group_id, event_id")
    .eq("id", registrationId)
    .single();
  if (!reg) return 0;

  // 2. Load event dates + registration group in parallel
  const [{ data: event }, { data: regGroup }, { data: feeLinks }] = await Promise.all([
    supabase
      .from("eckcm_events")
      .select("event_start_date, early_registration_start, early_registration_end")
      .eq("id", reg.event_id)
      .single(),
    supabase
      .from("eckcm_registration_groups")
      .select("global_registration_fee_cents, global_early_bird_fee_cents, early_bird_deadline")
      .eq("id", reg.registration_group_id)
      .single(),
    supabase
      .from("eckcm_registration_group_fee_categories")
      .select("eckcm_fee_categories!inner(code, amount_cents, age_min, age_max)")
      .eq("registration_group_id", reg.registration_group_id),
  ]);

  if (!event || !regGroup) return 0;

  const linked = (feeLinks ?? []).map((row: any) => row.eckcm_fee_categories);
  const regFeeCat = linked.find((f: any) => f.code === "REG_FEE");
  const earlyBirdCat = linked.find((f: any) => f.code === "EARLY_BIRD");

  const feeAmount = regGroup.global_registration_fee_cents ?? regFeeCat?.amount_cents ?? 0;
  const earlyBirdAmount = regGroup.global_early_bird_fee_cents ?? earlyBirdCat?.amount_cents ?? null;

  // Check early bird status
  const effDeadline = regGroup.early_bird_deadline ?? event.early_registration_end ?? null;
  const effStart = event.early_registration_start ?? null;
  const now = new Date();
  const eb = effDeadline != null && now < new Date(effDeadline) && (effStart == null || now >= new Date(effStart));

  const activeFee = eb && earlyBirdAmount != null ? earlyBirdAmount : feeAmount;
  if (activeFee === 0) return 0; // No registration fee → no billable participants

  // Age bounds from the active fee category
  const ageMin = eb && earlyBirdAmount != null ? (earlyBirdCat?.age_min ?? null) : (regFeeCat?.age_min ?? null);
  const ageMax = eb && earlyBirdAmount != null ? (earlyBirdCat?.age_max ?? null) : (regFeeCat?.age_max ?? null);

  // If no age restriction, count all participants
  if (ageMin == null && ageMax == null) {
    const { data: groups } = await supabase
      .from("eckcm_groups")
      .select("id")
      .eq("registration_id", registrationId);
    const groupIds = (groups ?? []).map((g: { id: string }) => g.id);
    if (groupIds.length === 0) return 0;
    const { count } = await supabase
      .from("eckcm_group_memberships")
      .select("id", { count: "exact", head: true })
      .in("group_id", groupIds);
    return count ?? 0;
  }

  // 3. Load participants with birth dates for age filtering
  const { data: groups } = await supabase
    .from("eckcm_groups")
    .select("id")
    .eq("registration_id", registrationId);
  const groupIds = (groups ?? []).map((g: { id: string }) => g.id);
  if (groupIds.length === 0) return 0;

  const { data: members } = await supabase
    .from("eckcm_group_memberships")
    .select("eckcm_people!inner(birth_date)")
    .in("group_id", groupIds);

  if (!members || members.length === 0) return 0;

  const eventStartDate = new Date(event.event_start_date + "T00:00:00");
  let billable = 0;
  for (const m of members) {
    const birthDateStr = (m as any).eckcm_people?.birth_date;
    if (!birthDateStr) {
      // No birth date → treat as adult (eligible)
      billable++;
      continue;
    }
    const birthDate = new Date(birthDateStr + "T00:00:00");
    const age = calculateAge(birthDate, eventStartDate);
    if (isAgeEligible(ageMin, ageMax, age)) {
      billable++;
    }
  }
  return billable;
}
