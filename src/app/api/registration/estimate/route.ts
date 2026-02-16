import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateEstimate } from "@/lib/services/pricing.service";

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

  const estimate = calculateEstimate({
    nightsCount,
    roomGroups,
    registrationFeePerPerson: regGroup.global_registration_fee_cents ?? 0,
    earlyBirdFeePerPerson: regGroup.global_early_bird_fee_cents,
    isEarlyBird,
    keyDepositPerKey: settings?.key_deposit_cents ?? 6500,
    additionalLodgingThreshold: settings?.additional_lodging_threshold ?? 3,
    additionalLodgingFeePerNight: settings?.additional_lodging_fee_cents ?? 400,
    lodgingRates,
  });

  return NextResponse.json(estimate);
}
