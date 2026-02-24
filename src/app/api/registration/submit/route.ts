import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSafeConfirmationCode } from "@/lib/services/confirmation-code.service";
import { calculateEstimate } from "@/lib/services/pricing.service";
import type { MealFeeCategory } from "@/lib/services/pricing.service";
import { createInvoice } from "@/lib/services/invoice.service";
import type { RoomGroupInput, AirportPickupInput, MealSelection } from "@/lib/types/registration";
import { buildPhoneValue } from "@/lib/utils/field-helpers";

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

interface SubmitBody {
  eventId: string;
  startDate: string;
  endDate: string;
  nightsCount: number;
  registrationGroupId: string;
  roomGroups: RoomGroupInput[];
  keyDeposit: number;
  airportPickup: AirportPickupInput;
}

export async function POST(request: Request) {
  try {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: SubmitBody = await request.json();
  const {
    eventId,
    startDate,
    endDate,
    nightsCount,
    registrationGroupId,
    roomGroups,
    airportPickup,
  } = body;

  if (
    !eventId ||
    !startDate ||
    !endDate ||
    !registrationGroupId ||
    !roomGroups?.length
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Use admin client for multi-table inserts (bypasses RLS for server-side transaction)
  const admin = createAdminClient();

  // 0. Check for duplicate registration (one user, one registration per event)
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

  // 1. Load registration group
  const { data: regGroup } = await admin
    .from("eckcm_registration_groups")
    .select("*")
    .eq("id", registrationGroupId)
    .single();

  if (!regGroup) {
    return NextResponse.json(
      { error: "Registration group not found" },
      { status: 404 }
    );
  }

  // 2. Load system settings
  const { data: settings } = await admin
    .from("eckcm_system_settings")
    .select("*")
    .eq("event_id", eventId)
    .single();

  // 3. Load all linked fee categories for this registration group
  const { data: allFeeLinks } = await admin
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

  // 3b. Extract key deposit from linked fees (unlinked = $0)
  const keyDepositCat = allLinkedFees.find((f: any) => f.code === "KEY_DEPOSIT");
  const keyDepositPerKey = keyDepositCat?.amount_cents ?? 0;

  // 3c. Extract meal fee categories from linked fees
  const mealFeeCategories: MealFeeCategory[] = allLinkedFees.filter(
    (f: any) => f.code.startsWith("MEAL_")
  );

  // 3d. Load event start date for age calculation
  const { data: event } = await admin
    .from("eckcm_events")
    .select("event_start_date")
    .eq("id", eventId)
    .single();

  // 4. Calculate pricing
  const isEarlyBird =
    regGroup.early_bird_deadline != null &&
    new Date() < new Date(regGroup.early_bird_deadline);

  const processedRoomGroups = populateDefaultMeals(
    roomGroups,
    startDate,
    endDate
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
    return NextResponse.json(
      { error: "Failed to create registration: " + regError.message },
      { status: 500 }
    );
  }

  // 6. Insert groups, people, and memberships
  let groupCodeCounter = 1;
  for (const roomGroup of roomGroups) {
    const groupCode = `G${String(groupCodeCounter++).padStart(2, "0")}`;

    const { data: group, error: groupError } = await admin
      .from("eckcm_groups")
      .insert({
        event_id: eventId,
        registration_id: registration.id,
        display_group_code: `${confirmationCode}-${groupCode}`,
        room_assign_status: "PENDING",
        preferences: roomGroup.preferences,
        key_count: roomGroup.keyCount,
      })
      .select("id")
      .single();

    if (groupError) {
      // Attempt cleanup
      await admin
        .from("eckcm_registrations")
        .delete()
        .eq("id", registration.id);
      return NextResponse.json(
        { error: "Failed to create group: " + groupError.message },
        { status: 500 }
      );
    }

    // Insert participants as people and group memberships
    for (const participant of roomGroup.participants) {
      const birthDate = `${participant.birthYear}-${String(participant.birthMonth).padStart(2, "0")}-${String(participant.birthDay).padStart(2, "0")}`;

      // Calculate age at event start date
      const eventStartStr = event?.event_start_date ?? startDate;
      const bd = new Date(birthDate + "T00:00:00");
      const ed = new Date(eventStartStr + "T00:00:00");
      let ageAtEvent = ed.getFullYear() - bd.getFullYear();
      const monthDiff = ed.getMonth() - bd.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && ed.getDate() < bd.getDate())) {
        ageAtEvent--;
      }

      const { data: person, error: personError } = await admin
        .from("eckcm_people")
        .insert({
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
        })
        .select("id")
        .single();

      if (personError) {
        await admin
          .from("eckcm_registrations")
          .delete()
          .eq("id", registration.id);
        return NextResponse.json(
          { error: "Failed to create person: " + personError.message },
          { status: 500 }
        );
      }

      // Generate 6-char participant confirmation code (unique per event)
      let participantCode = "";
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateSafeConfirmationCode();
        const { data: existingCode } = await admin
          .from("eckcm_group_memberships")
          .select("id")
          .eq("participant_code", candidate)
          .maybeSingle();
        if (!existingCode) {
          participantCode = candidate;
          break;
        }
      }
      if (!participantCode) {
        participantCode = generateSafeConfirmationCode();
      }

      // Group membership with participant code
      await admin.from("eckcm_group_memberships").insert({
        group_id: group.id,
        person_id: person.id,
        role: participant.isRepresentative ? "REPRESENTATIVE" : "MEMBER",
        status: "ACTIVE",
        participant_code: participantCode,
      });
    }
  }

  // 7. Airport rides (if any selected)
  if (airportPickup?.selectedRides?.length) {
    for (const ride of airportPickup.selectedRides) {
      const passengerCount = ride.selectedParticipantIds?.length ?? 1;
      await admin.from("eckcm_registration_rides").insert({
        registration_id: registration.id,
        ride_id: ride.rideId,
        passenger_count: passengerCount,
        flight_info: ride.flightInfo || null,
      });
    }
  } else if (airportPickup?.needed && airportPickup?.details) {
    // Legacy fallback: free-text only
    await admin
      .from("eckcm_registrations")
      .update({
        notes: `Airport pickup needed: ${airportPickup.details}`,
      })
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
    console.error("Invoice creation failed:", invoiceErr);
    // Non-fatal: registration is still valid, invoice can be created later
  }

  return NextResponse.json({
    registrationId: registration.id,
    confirmationCode,
    total: estimate.total,
  });
  } catch (err) {
    console.error("[registration/submit] Unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
