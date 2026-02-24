import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSafeConfirmationCode } from "@/lib/services/confirmation-code.service";
import { generateEPassToken } from "@/lib/services/epass.service";
import { calculateEstimate } from "@/lib/services/pricing.service";
import type { MealFeeCategory } from "@/lib/services/pricing.service";
import { createInvoice } from "@/lib/services/invoice.service";
import { sendConfirmationEmail } from "@/lib/email/send-confirmation";
import type { RoomGroupInput, MealSelection } from "@/lib/types/registration";
import { buildPhoneValue } from "@/lib/utils/field-helpers";

const MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER"] as const;

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

interface AdminRegBody {
  eventId: string;
  startDate: string;
  endDate: string;
  nightsCount: number;
  registrationGroupId: string;
  roomGroups: RoomGroupInput[];
  keyDeposit: number;
  paymentMethod: string;
  note?: string;
}

export async function POST(request: Request) {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Admin check
    const { data: assignments } = await supabase
      .from("eckcm_staff_assignments")
      .select("id, eckcm_roles(name)")
      .eq("user_id", user.id)
      .eq("is_active", true);

    const isAdmin = assignments?.some((a) => {
      const roleName = (a.eckcm_roles as unknown as { name: string })?.name;
      return roleName === "SUPER_ADMIN" || roleName === "EVENT_ADMIN";
    });

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Only admins can create manual registrations" },
        { status: 403 }
      );
    }

    // 3. Parse body
    const body: AdminRegBody = await request.json();
    const {
      eventId,
      startDate,
      endDate,
      nightsCount,
      registrationGroupId,
      roomGroups,
      paymentMethod,
      note,
    } = body;

    if (!eventId || !startDate || !endDate || !registrationGroupId || !roomGroups?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const validMethods = ["MANUAL", "CHECK", "ZELLE", "ACH"];
    if (!validMethods.includes(paymentMethod)) {
      return NextResponse.json(
        { error: `Invalid payment method. Must be one of: ${validMethods.join(", ")}` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 4. Load registration group
    const { data: regGroup } = await admin
      .from("eckcm_registration_groups")
      .select("*")
      .eq("id", registrationGroupId)
      .single();

    if (!regGroup) {
      return NextResponse.json({ error: "Registration group not found" }, { status: 404 });
    }

    // 5. Load system settings
    const { data: settings } = await admin
      .from("eckcm_app_config")
      .select("*")
      .eq("event_id", eventId)
      .single();

    // 6. Load fee categories
    const { data: allFeeLinks } = await admin
      .from("eckcm_registration_group_fee_categories")
      .select("eckcm_fee_categories!inner(code, name_en, pricing_type, amount_cents, age_min, age_max)")
      .eq("registration_group_id", registrationGroupId);

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

    // 7. Load event
    const { data: event } = await admin
      .from("eckcm_events")
      .select("event_start_date")
      .eq("id", eventId)
      .single();

    // 8. Calculate pricing
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

    // 9. Generate confirmation code
    const representative = processedRoomGroups
      .flatMap((g) => g.participants)
      .find((p) => p.isRepresentative);
    const rawLastName = (representative?.lastName ?? "X").toUpperCase().replace(/[^A-Z]/g, "") || "X";
    const repLastName = rawLastName.slice(0, 3).padEnd(3, "0");
    const eventYear = String(event?.event_start_date ?? startDate).slice(2, 4);

    const { data: seqResult } = await admin.rpc("get_next_registration_seq", {
      p_event_id: eventId,
    });
    const seqNum = (seqResult as number) ?? 1;
    const confirmationCode = `R${eventYear}${repLastName}${String(seqNum).padStart(4, "0")}`;

    // 10. Insert registration (PAID immediately)
    const { data: registration, error: regError } = await admin
      .from("eckcm_registrations")
      .insert({
        event_id: eventId,
        created_by_user_id: user.id,
        registration_group_id: registrationGroupId,
        status: "PAID",
        confirmation_code: confirmationCode,
        start_date: startDate,
        end_date: endDate,
        nights_count: nightsCount,
        total_amount_cents: estimate.total,
        notes: note || null,
      })
      .select("id")
      .single();

    if (regError) {
      return NextResponse.json(
        { error: "Failed to create registration: " + regError.message },
        { status: 500 }
      );
    }

    // 11. Insert groups, people, memberships
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
        await admin.from("eckcm_registrations").delete().eq("id", registration.id);
        return NextResponse.json(
          { error: "Failed to create group: " + groupError.message },
          { status: 500 }
        );
      }

      for (const participant of roomGroup.participants) {
        const birthDate = `${participant.birthYear}-${String(participant.birthMonth).padStart(2, "0")}-${String(participant.birthDay).padStart(2, "0")}`;

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
          await admin.from("eckcm_registrations").delete().eq("id", registration.id);
          return NextResponse.json(
            { error: "Failed to create person: " + personError.message },
            { status: 500 }
          );
        }

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

        await admin.from("eckcm_group_memberships").insert({
          group_id: group.id,
          person_id: person.id,
          role: participant.isRepresentative ? "REPRESENTATIVE" : "MEMBER",
          status: "ACTIVE",
          participant_code: participantCode,
        });

        // Generate E-Pass token for each person
        const { token, tokenHash } = generateEPassToken();
        await admin.from("eckcm_epass_tokens").insert({
          person_id: person.id,
          registration_id: registration.id,
          token,
          token_hash: tokenHash,
          is_active: true,
        });
      }
    }

    // 12. Create invoice (SUCCEEDED)
    let invoiceId: string | null = null;
    try {
      invoiceId = await createInvoice(admin, {
        registrationId: registration.id,
        totalCents: estimate.total,
        breakdown: estimate.breakdown,
      });

      // Mark invoice as paid
      await admin
        .from("eckcm_invoices")
        .update({ status: "SUCCEEDED", paid_at: new Date().toISOString() })
        .eq("id", invoiceId);

      // Insert payment record
      await admin.from("eckcm_payments").insert({
        invoice_id: invoiceId,
        payment_method: paymentMethod,
        amount_cents: estimate.total,
        status: "SUCCEEDED",
        metadata: {
          recorded_by: user.id,
          note: note || null,
          manual: true,
          admin_registration: true,
        },
      });
    } catch (invoiceErr) {
      console.error("[admin/registration] Invoice creation failed:", invoiceErr);
    }

    // 13. Send confirmation email (non-blocking)
    try {
      await sendConfirmationEmail(registration.id);
    } catch (err) {
      console.error("[admin/registration] Failed to send confirmation email:", err);
    }

    // 14. Audit log
    await admin.from("eckcm_audit_logs").insert({
      event_id: eventId,
      user_id: user.id,
      action: "ADMIN_MANUAL_REGISTRATION",
      entity_type: "registration",
      entity_id: registration.id,
      new_data: {
        confirmation_code: confirmationCode,
        payment_method: paymentMethod,
        total_cents: estimate.total,
        participant_count: roomGroups.reduce((s, g) => s + g.participants.length, 0),
        note: note || null,
      },
    });

    return NextResponse.json({
      registrationId: registration.id,
      confirmationCode,
      total: estimate.total,
    });
  } catch (err) {
    console.error("[admin/registration] Unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
