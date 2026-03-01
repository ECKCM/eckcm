import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSafeConfirmationCode } from "@/lib/services/confirmation-code.service";
import { calculateEstimate } from "@/lib/services/pricing.service";
import type { MealFeeCategory } from "@/lib/services/pricing.service";
import { createInvoice } from "@/lib/services/invoice.service";
import type { RoomGroupInput, AirportPickupInput } from "@/lib/types/registration";
import { buildPhoneValue } from "@/lib/utils/field-helpers";
import { submitRegistrationSchema } from "@/lib/schemas/api";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { populateDefaultMeals } from "@/lib/services/meal.service";


export async function POST(request: Request) {
  try {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`submit:${user.id}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = submitRegistrationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const {
    eventId,
    startDate,
    endDate,
    nightsCount,
    registrationGroupId,
    roomGroups,
    airportPickup,
  } = parsed.data;

  // Use admin client for multi-table inserts (bypasses RLS for server-side transaction)
  const admin = createAdminClient();

  // 0. Load all reference data in parallel (5 independent queries → 1 round trip)
  const [appConfigRes, regGroupRes, settingsRes, allFeeLinksRes, eventRes] = await Promise.all([
    admin.from("eckcm_app_config").select("allow_duplicate_registration").eq("id", 1).single(),
    admin.from("eckcm_registration_groups").select("*").eq("id", registrationGroupId).single(),
    admin.from("eckcm_app_config").select("*").eq("event_id", eventId).single(),
    admin.from("eckcm_registration_group_fee_categories")
      .select("eckcm_fee_categories!inner(code, name_en, pricing_type, amount_cents, age_min, age_max)")
      .eq("registration_group_id", registrationGroupId),
    admin.from("eckcm_events").select("event_start_date, event_end_date").eq("id", eventId).single(),
  ]);

  const appConfig = appConfigRes.data;
  const regGroup = regGroupRes.data;
  const settings = settingsRes.data;
  const allFeeLinks = allFeeLinksRes.data;
  const event = eventRes.data;

  if (!regGroup) {
    return NextResponse.json(
      { error: "Registration group not found" },
      { status: 404 }
    );
  }

  // 1. Check for duplicate registration
  if (!appConfig?.allow_duplicate_registration) {
    const { data: existingReg } = await admin
      .from("eckcm_registrations")
      .select("id, confirmation_code")
      .eq("event_id", eventId)
      .eq("created_by_user_id", user.id)
      .in("status", ["DRAFT", "SUBMITTED", "PAID"])
      .limit(1)
      .maybeSingle();

    if (existingReg) {
      return NextResponse.json(
        { error: "You already have a registration for this event", confirmationCode: existingReg.confirmation_code },
        { status: 409 }
      );
    }
  }

  // 2. Process fee categories from parallel-loaded data
  const allLinkedFees = (allFeeLinks ?? []).map((row: any) => row.eckcm_fee_categories);

  const regFeeCat = allLinkedFees.find((f: any) => f.code === "REG_FEE");
  const earlyBirdCat = allLinkedFees.find((f: any) => f.code === "EARLY_BIRD");

  const registrationFeePerPerson =
    regGroup.global_registration_fee_cents ?? regFeeCat?.amount_cents ?? 0;
  const earlyBirdFeePerPerson =
    regGroup.global_early_bird_fee_cents ?? earlyBirdCat?.amount_cents ?? null;

  const lodgingRates = allLinkedFees.filter((f: any) => f.code.startsWith("LODGING_"));
  const keyDepositCat = allLinkedFees.find((f: any) => f.code === "KEY_DEPOSIT");
  const keyDepositPerKey = keyDepositCat?.amount_cents ?? 0;
  const mealFeeCategories: MealFeeCategory[] = allLinkedFees.filter(
    (f: any) => f.code.startsWith("MEAL_")
  );

  // 4. Calculate pricing
  const isEarlyBird =
    regGroup.early_bird_deadline != null &&
    new Date() < new Date(regGroup.early_bird_deadline);

  const evStartDate = event?.event_start_date ?? startDate;
  const evEndDate = event?.event_end_date ?? endDate;
  const processedRoomGroups = populateDefaultMeals(
    roomGroups,
    startDate,
    endDate,
    evStartDate,
    evEndDate
  );

  const estimate = calculateEstimate({
    nightsCount,
    roomGroups: processedRoomGroups,
    registrationFeePerPerson,
    earlyBirdFeePerPerson,
    isEarlyBird,
    keyDepositPerKey,
    additionalLodgingThreshold: settings?.additional_lodging_threshold ?? 3,
    additionalLodgingFeePerNight: settings?.additional_lodging_fee_cents ?? 400,
    lodgingRates,
    mealFeeCategories,
    eventStartDate: event?.event_start_date ?? startDate,
  });

  // 4. Generate registration confirmation code: R{YY}{NAME3}{4-digit-seq}
  // Format: R + last 2 digits of event year + last name (max 3 chars, zero-padded) + 4-digit sequence
  // e.g. R26KIM0001, R26YU00032, R26X000003
  const representative = processedRoomGroups
    .flatMap((g) => g.participants)
    .find((p) => p.isRepresentative);
  const rawLastName = (representative?.lastName ?? "X").toUpperCase().replace(/[^A-Z]/g, "") || "X";
  const repLastName = rawLastName.slice(0, 3).padEnd(3, "0");
  const eventYear = String(event?.event_start_date ?? startDate).slice(2, 4); // YY

  // Atomically get-and-increment sequence
  const { data: seqResult } = await admin.rpc("get_next_registration_seq", {
    p_event_id: eventId,
  });
  const seqNum = (seqResult as number) ?? 1;
  const confirmationCode = `R${eventYear}${repLastName}${String(seqNum).padStart(4, "0")}`;

  // 5. Insert registration
  const { data: registration, error: regError } = await admin
    .from("eckcm_registrations")
    .insert({
      event_id: eventId,
      created_by_user_id: user.id,
      registration_group_id: registrationGroupId,
      status: "DRAFT",
      confirmation_code: confirmationCode,
      start_date: startDate,
      end_date: endDate,
      nights_count: nightsCount,
      total_amount_cents: estimate.total,
    })
    .select("id")
    .single();

  if (regError) {
    logger.error("[registration/submit] Registration insert error", { error: String(regError) });
    return NextResponse.json(
      { error: "Failed to create registration" },
      { status: 500 }
    );
  }

  // 6. Batch insert groups, people, and memberships
  // (3 batch operations instead of N+1 individual inserts)

  // Pre-generate all participant codes in batch
  const totalParticipants = roomGroups.reduce((sum, g) => sum + g.participants.length, 0);
  const candidates: string[] = [];
  for (let i = 0; i < totalParticipants + 10; i++) {
    candidates.push(generateSafeConfirmationCode());
  }
  const { data: existingCodes } = await admin
    .from("eckcm_group_memberships")
    .select("participant_code")
    .in("participant_code", candidates);
  const usedCodes = new Set((existingCodes ?? []).map((c: { participant_code: string }) => c.participant_code));
  const availableCodes = candidates.filter((c) => !usedCodes.has(c));

  // Batch 1: Insert all groups at once
  const groupInserts = roomGroups.map((roomGroup, i) => ({
    event_id: eventId,
    registration_id: registration.id,
    display_group_code: `${confirmationCode}-G${String(i + 1).padStart(2, "0")}`,
    room_assign_status: "PENDING",
    preferences: roomGroup.preferences,
    key_count: roomGroup.keyCount,
  }));

  const { data: groups, error: groupError } = await admin
    .from("eckcm_groups")
    .insert(groupInserts)
    .select("id");

  if (groupError || !groups) {
    logger.error("[registration/submit] Group batch insert error", { error: String(groupError) });
    await admin.from("eckcm_registrations").delete().eq("id", registration.id);
    return NextResponse.json({ error: "Failed to create groups" }, { status: 500 });
  }

  // Batch 2: Insert all people at once (track group index for membership mapping)
  const personInserts: Record<string, unknown>[] = [];
  const personGroupMap: { groupIdx: number; isRep: boolean }[] = [];

  for (let gi = 0; gi < roomGroups.length; gi++) {
    for (const participant of roomGroups[gi].participants) {
      const birthDate = `${participant.birthYear}-${String(participant.birthMonth).padStart(2, "0")}-${String(participant.birthDay).padStart(2, "0")}`;
      const eventStartStr = event?.event_start_date ?? startDate;
      const bd = new Date(birthDate + "T00:00:00");
      const ed = new Date(eventStartStr + "T00:00:00");
      let ageAtEvent = ed.getFullYear() - bd.getFullYear();
      const monthDiff = ed.getMonth() - bd.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && ed.getDate() < bd.getDate())) {
        ageAtEvent--;
      }

      personInserts.push({
        last_name_en: participant.lastName,
        first_name_en: participant.firstName,
        display_name_ko: participant.displayNameKo || null,
        gender: participant.gender,
        birth_date: birthDate,
        age_at_event: ageAtEvent,
        is_k12: participant.isK12,
        grade: participant.grade || null,
        email: participant.email || null,
        phone: buildPhoneValue(participant.phoneCountry || "US", participant.phone || "") || null,
        phone_country: participant.phoneCountry || "US",
        department_id: participant.departmentId || null,
        church_id: participant.churchId || null,
        church_other: participant.churchOther || null,
      });
      personGroupMap.push({ groupIdx: gi, isRep: !!participant.isRepresentative });
    }
  }

  const { data: people, error: personError } = await admin
    .from("eckcm_people")
    .insert(personInserts)
    .select("id");

  if (personError || !people) {
    logger.error("[registration/submit] People batch insert error", { error: String(personError) });
    await admin.from("eckcm_registrations").delete().eq("id", registration.id);
    return NextResponse.json({ error: "Failed to create participants" }, { status: 500 });
  }

  // Batch 3: Insert all memberships at once
  const membershipInserts = people.map((person, i) => {
    const { groupIdx, isRep } = personGroupMap[i];
    const participantCode = availableCodes[i] || generateSafeConfirmationCode();
    return {
      group_id: groups[groupIdx].id,
      person_id: person.id,
      role: isRep ? "REPRESENTATIVE" : "MEMBER",
      status: "ACTIVE",
      participant_code: participantCode,
    };
  });

  const { error: membershipError } = await admin
    .from("eckcm_group_memberships")
    .insert(membershipInserts);

  if (membershipError) {
    logger.error("[registration/submit] Membership batch insert error", { error: String(membershipError) });
    await admin.from("eckcm_people").delete().in("id", people.map(p => p.id));
    await admin.from("eckcm_registrations").delete().eq("id", registration.id);
    return NextResponse.json({ error: "Failed to create memberships" }, { status: 500 });
  }

  // 7. Airport rides (batch insert)
  if (airportPickup?.selectedRides?.length) {
    const rideInserts = airportPickup.selectedRides.map((ride) => ({
      registration_id: registration.id,
      ride_id: ride.rideId,
      passenger_count: ride.selectedParticipantIds?.length ?? 1,
      flight_info: ride.flightInfo || null,
    }));
    await admin.from("eckcm_registration_rides").insert(rideInserts);
  } else if (airportPickup?.needed && airportPickup?.details) {
    await admin
      .from("eckcm_registrations")
      .update({ notes: `Airport pickup needed: ${airportPickup.details}` })
      .eq("id", registration.id);
  }

  // 8. Create invoice with line items
  try {
    await createInvoice(admin, {
      registrationId: registration.id,
      totalCents: estimate.total,
      breakdown: estimate.breakdown,
    });
  } catch (invoiceErr) {
    logger.error("[registration/submit] Invoice creation failed", { error: String(invoiceErr) });
    // Non-fatal: registration is still valid, invoice can be created later
  }

  return NextResponse.json({
    registrationId: registration.id,
    confirmationCode,
    total: estimate.total,
  });
  } catch (err) {
    logger.error("[registration/submit] Unhandled error", { error: String(err) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
