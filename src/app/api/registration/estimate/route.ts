import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateEstimate, loadMemberGroupFees, computeWaivedBenefits, remapLodgingForDefault } from "@/lib/services/pricing.service";
import type { MealFeeCategory, LodgingRate } from "@/lib/services/pricing.service";
import { estimateSchema } from "@/lib/schemas/api";
import { logger } from "@/lib/logger";
import { populateDefaultMeals } from "@/lib/services/meal.service";
import { loadFundingForGroup, toFundingDiscounts } from "@/lib/services/funding.service";

export async function POST(request: Request) {
  try {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = estimateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { eventId, startDate, endDate, nightsCount, registrationGroupId, roomGroups } = parsed.data;

  // Load registration group
  const { data: regGroup } = await supabase
    .from("eckcm_registration_groups")
    .select("*")
    .eq("id", registrationGroupId)
    .single();

  if (!regGroup) {
    return NextResponse.json({ error: "Registration group not found" }, { status: 404 });
  }

  // Load event-level early registration dates for fallback
  const { data: eventEarlyDates } = await supabase
    .from("eckcm_events")
    .select("early_registration_start, early_registration_end")
    .eq("id", eventId)
    .single();

  // Check early bird: group-level deadline takes priority, fall back to event-level
  const effectiveEarlyBirdDeadline =
    regGroup.early_bird_deadline ?? eventEarlyDates?.early_registration_end ?? null;
  const effectiveEarlyBirdStart =
    eventEarlyDates?.early_registration_start ?? null;
  const now = new Date();
  const isEarlyBird =
    effectiveEarlyBirdDeadline != null &&
    now < new Date(effectiveEarlyBirdDeadline) &&
    (effectiveEarlyBirdStart == null || now >= new Date(effectiveEarlyBirdStart));

  // Load system settings for the event
  const { data: settings } = await supabase
    .from("eckcm_app_config")
    .select("*")
    .eq("event_id", eventId)
    .single();

  // Load all linked fee categories for this registration group
  const { data: allFeeLinks } = await supabase
    .from("eckcm_registration_group_fee_categories")
    .select("eckcm_fee_categories!inner(code, name_en, pricing_type, amount_cents, age_min, age_max)")
    .eq("registration_group_id", registrationGroupId);

  const allLinkedFees = (allFeeLinks ?? []).map((row: any) => row.eckcm_fee_categories);

  // Extract registration fees from linked fee categories
  const regFeeCat = allLinkedFees.find((f: any) => f.code === "REG_FEE");
  const earlyBirdCat = allLinkedFees.find((f: any) => f.code === "EARLY_BIRD");

  const registrationFeePerPerson =
    regGroup.global_registration_fee_cents ?? regFeeCat?.amount_cents ?? 0;
  const earlyBirdFeePerPerson =
    regGroup.global_early_bird_fee_cents ?? earlyBirdCat?.amount_cents ?? null;

  const lodgingRates = allLinkedFees.filter((f: any) => f.code.startsWith("LODGING_"));

  // Additional lodging fee only applies if LODGING_EXTRA is linked to this registration group
  const hasLodgingExtra = allLinkedFees.some((f: any) => f.code === "LODGING_EXTRA");

  // Extract key deposit from linked fees (unlinked = $0)
  const keyDepositCat = allLinkedFees.find((f: any) => f.code === "KEY_DEPOSIT");
  const keyDepositPerKey = keyDepositCat?.amount_cents ?? 0;

  // Extract meal fee categories from linked fees
  const mealFeeCategories: MealFeeCategory[] = allLinkedFees.filter(
    (f: any) => f.code.startsWith("MEAL_")
  );

  // Extract VBS materials fee (per child in VBS department)
  const vbsMaterialsCat = allLinkedFees.find((f: any) => f.code === "VBS_MATERIALS");
  const vbsMaterialsFeeCents = vbsMaterialsCat?.amount_cents ?? 0;

  // Extract manual payment discount per person
  const manualDiscountCat = allLinkedFees.find((f: any) => f.code === "MANUAL_PAYMENT_DISCOUNT");
  const manualPaymentDiscountPerPerson = manualDiscountCat?.amount_cents ?? 0;

  // Fee Application Scope flags
  const applyGeneralFeesToMembers = regGroup.apply_general_fees_to_members ?? true;
  const applyMealFeesToMembers = regGroup.apply_meal_fees_to_members ?? true;

  // Load default group for dual-estimate comparison + scope toggle defaults
  let hasDefaultGroup = false;
  let defRegistrationFeePerPerson = 0;
  let defEarlyBirdFeePerPerson: number | null = null;
  let defIsEarlyBird = false;
  let defMealFeeCategories: MealFeeCategory[] = [];
  let defManualPaymentDiscountPerPerson = 0;
  let defLodgingRates: LodgingRate[] = [];
  let defKeyDepositPerKey = 0;
  let defHasLodgingExtra = false;
  let defVbsMaterialsFeeCents = 0;

  if (!regGroup.is_default) {
    const { data: defaultGroup } = await supabase
      .from("eckcm_registration_groups")
      .select("*")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();

    if (defaultGroup) {
      hasDefaultGroup = true;
      const { data: defaultFeeLinks } = await supabase
        .from("eckcm_registration_group_fee_categories")
        .select("eckcm_fee_categories!inner(code, name_en, pricing_type, amount_cents, age_min, age_max)")
        .eq("registration_group_id", defaultGroup.id);

      const defaultLinkedFees = (defaultFeeLinks ?? []).map((row: any) => row.eckcm_fee_categories);

      // Extract ALL default group fee parameters (for dual estimate + scope toggles)
      const defRegFeeCat = defaultLinkedFees.find((f: any) => f.code === "REG_FEE");
      const defEarlyBirdCat = defaultLinkedFees.find((f: any) => f.code === "EARLY_BIRD");
      defRegistrationFeePerPerson =
        defaultGroup.global_registration_fee_cents ?? defRegFeeCat?.amount_cents ?? 0;
      defEarlyBirdFeePerPerson =
        defaultGroup.global_early_bird_fee_cents ?? defEarlyBirdCat?.amount_cents ?? null;
      const defEffectiveDeadline =
        defaultGroup.early_bird_deadline ?? eventEarlyDates?.early_registration_end ?? null;
      defIsEarlyBird =
        defEffectiveDeadline != null &&
        now < new Date(defEffectiveDeadline) &&
        (effectiveEarlyBirdStart == null || now >= new Date(effectiveEarlyBirdStart));
      const defManualDiscount = defaultLinkedFees.find((f: any) => f.code === "MANUAL_PAYMENT_DISCOUNT");
      defManualPaymentDiscountPerPerson = defManualDiscount?.amount_cents ?? 0;
      defMealFeeCategories = defaultLinkedFees.filter((f: any) => f.code.startsWith("MEAL_"));
      defLodgingRates = defaultLinkedFees.filter((f: any) => f.code.startsWith("LODGING_"));
      const defKeyDepositCat = defaultLinkedFees.find((f: any) => f.code === "KEY_DEPOSIT");
      defKeyDepositPerKey = defKeyDepositCat?.amount_cents ?? 0;
      defHasLodgingExtra = defaultLinkedFees.some((f: any) => f.code === "LODGING_EXTRA");
      const defVbsCat = defaultLinkedFees.find((f: any) => f.code === "VBS_MATERIALS");
      defVbsMaterialsFeeCents = defVbsCat?.amount_cents ?? 0;
    }
  }

  // Load VBS department IDs (only if fee applies)
  let vbsDepartmentIds: string[] = [];
  if (vbsMaterialsFeeCents > 0) {
    const { data: vbsDepts } = await supabase
      .from("eckcm_departments")
      .select("id")
      .ilike("name_en", "%VBS%")
      .eq("is_active", true);
    vbsDepartmentIds = (vbsDepts ?? []).map((d: { id: string }) => d.id);
  }

  // Load event dates for age calculation and meal day filtering
  const { data: event } = await supabase
    .from("eckcm_events")
    .select("event_start_date, event_end_date, early_registration_start, early_registration_end")
    .eq("id", eventId)
    .single();

  // Populate default meals for participants with empty selections
  const evStartDate = event?.event_start_date ?? startDate;
  const evEndDate = event?.event_end_date ?? endDate;
  const processedRoomGroups = populateDefaultMeals(
    roomGroups,
    startDate,
    endDate,
    evStartDate,
    evEndDate
  );

  // Load per-member group fees when members have their own access codes
  const memberGroupFees = (!applyGeneralFeesToMembers || !applyMealFeesToMembers)
    ? await loadMemberGroupFees(supabase, processedRoomGroups, eventEarlyDates)
    : {};

  // Load active funding sources targeting this registration group
  const fundingSources = await loadFundingForGroup(supabase, registrationGroupId);
  const fundingDiscounts = toFundingDiscounts(fundingSources);

  const estimate = calculateEstimate({
    nightsCount,
    roomGroups: processedRoomGroups,
    registrationFeePerPerson,
    earlyBirdFeePerPerson,
    isEarlyBird,
    keyDepositPerKey,
    additionalLodgingThreshold: settings?.additional_lodging_threshold ?? 2,
    additionalLodgingFeePerNight: hasLodgingExtra ? (settings?.additional_lodging_fee_cents ?? 400) : 0,
    lodgingRates,
    mealFeeCategories,
    eventStartDate: event?.event_start_date ?? startDate,
    vbsMaterialsFeeCents,
    vbsDepartmentIds,
    manualPaymentDiscountPerPerson,
    applyGeneralFeesToMembers,
    applyMealFeesToMembers,
    defaultRegistrationFeePerPerson: defRegistrationFeePerPerson,
    defaultEarlyBirdFeePerPerson: defEarlyBirdFeePerPerson,
    defaultIsEarlyBird: defIsEarlyBird,
    defaultMealFeeCategories: defMealFeeCategories,
    defaultManualPaymentDiscountPerPerson: defManualPaymentDiscountPerPerson,
    memberGroupFees,
    fundingDiscounts,
  });

  // Dual estimate: compute what default group would charge, then list waived benefits
  if (hasDefaultGroup) {
    const remappedRoomGroups = remapLodgingForDefault(processedRoomGroups, defLodgingRates);
    const defaultEstimate = calculateEstimate({
      nightsCount,
      roomGroups: remappedRoomGroups,
      registrationFeePerPerson: defRegistrationFeePerPerson,
      earlyBirdFeePerPerson: defEarlyBirdFeePerPerson,
      isEarlyBird: defIsEarlyBird,
      keyDepositPerKey: defKeyDepositPerKey,
      additionalLodgingThreshold: settings?.additional_lodging_threshold ?? 2,
      additionalLodgingFeePerNight: defHasLodgingExtra ? (settings?.additional_lodging_fee_cents ?? 400) : 0,
      lodgingRates: defLodgingRates,
      mealFeeCategories: defMealFeeCategories,
      eventStartDate: event?.event_start_date ?? startDate,
      vbsMaterialsFeeCents: defVbsMaterialsFeeCents,
      vbsDepartmentIds,
      manualPaymentDiscountPerPerson: defManualPaymentDiscountPerPerson,
      applyGeneralFeesToMembers: true,
      applyMealFeesToMembers: true,
      defaultRegistrationFeePerPerson: defRegistrationFeePerPerson,
      defaultEarlyBirdFeePerPerson: defEarlyBirdFeePerPerson,
      defaultIsEarlyBird: defIsEarlyBird,
      defaultMealFeeCategories: defMealFeeCategories,
      defaultManualPaymentDiscountPerPerson: defManualPaymentDiscountPerPerson,
    });
    estimate.breakdown.push(...computeWaivedBenefits(estimate, defaultEstimate));
  }

  return NextResponse.json(estimate);
  } catch (err) {
    logger.error("[registration/estimate] Unhandled error", { error: String(err) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
