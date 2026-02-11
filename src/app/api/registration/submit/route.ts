import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSafeConfirmationCode } from "@/lib/services/confirmation-code.service";
import { calculateEstimate } from "@/lib/services/pricing.service";
import type { RoomGroupInput, AirportPickupInput } from "@/lib/types/registration";

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

  // 1. Load registration group
  const { data: regGroup } = await admin
    .from("ECKCM_registration_groups")
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
    .from("ECKCM_system_settings")
    .select("*")
    .eq("event_id", eventId)
    .single();

  // 3. Calculate pricing
  const isEarlyBird =
    regGroup.early_bird_deadline != null &&
    new Date() < new Date(regGroup.early_bird_deadline);

  const estimate = calculateEstimate({
    nightsCount,
    roomGroups,
    registrationFeePerPerson: regGroup.global_registration_fee_cents ?? 0,
    earlyBirdFeePerPerson: regGroup.global_early_bird_fee_cents,
    isEarlyBird,
    keyDepositPerKey: settings?.key_deposit_cents ?? 6500,
    additionalLodgingThreshold: settings?.additional_lodging_threshold ?? 3,
    additionalLodgingFeePerNight: settings?.additional_lodging_fee_cents ?? 400,
  });

  // 4. Generate confirmation code (unique per event)
  let confirmationCode = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateSafeConfirmationCode();
    const { data: existing } = await admin
      .from("ECKCM_registrations")
      .select("id")
      .eq("event_id", eventId)
      .eq("confirmation_code", candidate)
      .maybeSingle();
    if (!existing) {
      confirmationCode = candidate;
      break;
    }
  }

  if (!confirmationCode) {
    return NextResponse.json(
      { error: "Failed to generate unique confirmation code" },
      { status: 500 }
    );
  }

  // 5. Insert registration
  const { data: registration, error: regError } = await admin
    .from("ECKCM_registrations")
    .insert({
      event_id: eventId,
      created_by_user_id: user.id,
      registration_group_id: registrationGroupId,
      status: "SUBMITTED",
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
    const groupCode = `G${String(groupCodeCounter++).padStart(4, "0")}`;

    const { data: group, error: groupError } = await admin
      .from("ECKCM_groups")
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
        .from("ECKCM_registrations")
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

      const { data: person, error: personError } = await admin
        .from("ECKCM_people")
        .insert({
          last_name_en: participant.lastName,
          first_name_en: participant.firstName,
          display_name_ko: participant.displayNameKo || null,
          gender: participant.gender,
          birth_date: birthDate,
          is_k12: participant.isK12,
          grade: participant.grade || null,
          email: participant.email || null,
          phone: participant.phone || null,
          department_id: participant.departmentId || null,
          church_id: participant.churchId || null,
          church_other: participant.churchOther || null,
        })
        .select("id")
        .single();

      if (personError) {
        await admin
          .from("ECKCM_registrations")
          .delete()
          .eq("id", registration.id);
        return NextResponse.json(
          { error: "Failed to create person: " + personError.message },
          { status: 500 }
        );
      }

      // Group membership
      await admin.from("ECKCM_group_memberships").insert({
        group_id: group.id,
        person_id: person.id,
        role: participant.isLeader ? "LEADER" : "MEMBER",
        status: "ACTIVE",
      });
    }
  }

  // 7. Airport pickup (if needed)
  if (airportPickup?.needed) {
    // Store as registration notes for now (airport_pickups table not yet created)
    await admin
      .from("ECKCM_registrations")
      .update({
        notes: `Airport pickup needed: ${airportPickup.details || "No details provided"}`,
      })
      .eq("id", registration.id);
  }

  return NextResponse.json({
    registrationId: registration.id,
    confirmationCode,
    total: estimate.total,
  });
}
