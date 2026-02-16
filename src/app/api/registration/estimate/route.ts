import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateEstimate } from "@/lib/services/pricing.service";
import type { MealFeeCategory } from "@/lib/services/pricing.service";
import type { RoomGroupInput, MealSelection } from "@/lib/types/registration";

const MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER"] as const;

/** Fill default full-day selections when participant has empty mealSelections */
function populateDefaultMeals(
  roomGroups: RoomGroupInput[],
  mealStartDate: string,
  mealEndDate: string
): RoomGroupInput[] {
  const start = new Date(mealStartDate + "T00:00:00");
  const end = new Date(mealEndDate + "T00:00:00");
  const mealDates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    mealDates.push(d.toISOString().split("T")[0]);
  }

  return roomGroups.map((group) => ({
    ...group,
    participants: group.participants.map((p) => {
      if (p.mealSelections.length > 0) return p;
      // Generate full-day selections for all meal dates
      const defaultSelections: MealSelection[] = [];
      for (const date of mealDates) {
        for (const mealType of MEAL_TYPES) {
          defaultSelections.push({ date, mealType, selected: true });
        }
      }
      return { ...p, mealSelections: defaultSelections };
    }),
  }));
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { eventId, startDate, endDate, nightsCount, registrationGroupId, roomGroups } = body;

  if (!eventId || !startDate || !endDate || !registrationGroupId || !roomGroups) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Load registration group
  const { data: regGroup } = await supabase
    .from("eckcm_registration_groups")
    .select("*")
    .eq("id", registrationGroupId)
    .single();

  if (!regGroup) {
    return NextResponse.json({ error: "Registration group not found" }, { status: 404 });
  }

  // Check early bird
  const isEarlyBird =
    regGroup.early_bird_deadline != null &&
    new Date() < new Date(regGroup.early_bird_deadline);

  // Load system settings for the event
  const { data: settings } = await supabase
    .from("eckcm_system_settings")
    .select("*")
    .eq("event_id", eventId)
    .single();

  // Load lodging fee categories for this registration group
  const { data: feeLinks } = await supabase
    .from("eckcm_registration_group_fee_categories")
    .select("eckcm_fee_categories!inner(code, name_en, pricing_type, amount_cents)")
    .eq("registration_group_id", registrationGroupId)
    .like("eckcm_fee_categories.code", "LODGING_%");

  const lodgingRates = (feeLinks ?? []).map((row: any) => row.eckcm_fee_categories);

  // Load meal fee categories (MEAL_* with age ranges)
  const { data: mealFeeLinks } = await supabase
    .from("eckcm_registration_group_fee_categories")
    .select("eckcm_fee_categories!inner(code, name_en, pricing_type, amount_cents, age_min, age_max)")
    .eq("registration_group_id", registrationGroupId)
    .like("eckcm_fee_categories.code", "MEAL_%");

  const mealFeeCategories: MealFeeCategory[] = (mealFeeLinks ?? []).map(
    (row: any) => row.eckcm_fee_categories
  );

  // Load meal rules for date range (used to populate default meals)
  const { data: mealRules } = await supabase
    .from("eckcm_meal_rules")
    .select("meal_start_date, meal_end_date")
    .eq("event_id", eventId)
    .maybeSingle();

  // Load event start date for age calculation
  const { data: event } = await supabase
    .from("eckcm_events")
    .select("event_start_date")
    .eq("id", eventId)
    .single();

  // Populate default meals for participants with empty selections
  let processedRoomGroups = roomGroups;
  if (mealRules) {
    processedRoomGroups = populateDefaultMeals(
      roomGroups,
      mealRules.meal_start_date,
      mealRules.meal_end_date
    );
  }

  const estimate = calculateEstimate({
    nightsCount,
    roomGroups: processedRoomGroups,
    registrationFeePerPerson: regGroup.global_registration_fee_cents ?? 0,
    earlyBirdFeePerPerson: regGroup.global_early_bird_fee_cents,
    isEarlyBird,
    keyDepositPerKey: settings?.key_deposit_cents ?? 6500,
    additionalLodgingThreshold: settings?.additional_lodging_threshold ?? 3,
    additionalLodgingFeePerNight: settings?.additional_lodging_fee_cents ?? 400,
    lodgingRates,
    mealFeeCategories,
    eventStartDate: event?.event_start_date ?? startDate,
  });

  return NextResponse.json(estimate);
}
