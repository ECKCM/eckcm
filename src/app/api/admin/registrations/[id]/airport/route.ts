import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAuditLog } from "@/lib/services/audit.service";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/registrations/[id]/airport
 *
 * Assign or unassign a single participant to a single airport ride.
 * eckcm_registration_rides is per-passenger (one row = one person on one ride),
 * so this just inserts/deletes that row.
 *
 * Body: { personId: string, rideId: string, assigned: boolean }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: registrationId } = await params;
  const { personId, rideId, assigned, flightInfo } = (await request.json()) as {
    personId?: string;
    rideId?: string;
    assigned?: boolean;
    flightInfo?: string;
  };

  // Two modes: toggle assignment (assigned boolean) or update flight info
  // (flightInfo string) on an already-assigned passenger.
  const isToggle = typeof assigned === "boolean";
  const isFlightUpdate = !isToggle && typeof flightInfo === "string";

  if (!personId || !rideId || (!isToggle && !isFlightUpdate)) {
    return NextResponse.json(
      { error: "personId, rideId and either assigned or flightInfo are required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Registration → event scope.
  const { data: reg } = await supabase
    .from("eckcm_registrations")
    .select("id, event_id, confirmation_code")
    .eq("id", registrationId)
    .single();
  if (!reg) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  // The ride must belong to this registration's event.
  const { data: ride } = await supabase
    .from("eckcm_airport_rides")
    .select("id, direction, event_id")
    .eq("id", rideId)
    .single();
  if (!ride || ride.event_id !== reg.event_id) {
    return NextResponse.json(
      { error: "Ride does not belong to this event" },
      { status: 400 }
    );
  }

  // The person must be a participant of this registration.
  const { data: membership } = await supabase
    .from("eckcm_group_memberships")
    .select("person_id, eckcm_groups!inner(registration_id)")
    .eq("person_id", personId)
    .eq("eckcm_groups.registration_id", registrationId)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: "Participant is not part of this registration" },
      { status: 400 }
    );
  }

  try {
    if (isToggle && assigned) {
      // Insert the passenger row; ignore if it already exists (unique on
      // ride_id, person_id) so we don't clobber an existing flight_info.
      const { error } = await supabase
        .from("eckcm_registration_rides")
        .upsert(
          {
            registration_id: registrationId,
            ride_id: rideId,
            person_id: personId,
            passenger_count: 1,
          },
          { onConflict: "ride_id,person_id", ignoreDuplicates: true }
        );
      if (error) throw error;
    } else if (isToggle) {
      const { error } = await supabase
        .from("eckcm_registration_rides")
        .delete()
        .eq("registration_id", registrationId)
        .eq("ride_id", rideId)
        .eq("person_id", personId);
      if (error) throw error;
    } else {
      // Flight info update on the existing passenger row.
      const { error } = await supabase
        .from("eckcm_registration_rides")
        .update({ flight_info: flightInfo || null })
        .eq("registration_id", registrationId)
        .eq("ride_id", rideId)
        .eq("person_id", personId);
      if (error) throw error;
    }
  } catch (err) {
    logger.error("[admin/airport] Failed to update ride", {
      registrationId,
      rideId,
      personId,
      assigned,
      isFlightUpdate,
      error: String(err),
    });
    return NextResponse.json(
      { error: "Failed to update airport assignment" },
      { status: 500 }
    );
  }

  await writeAuditLog(supabase, {
    event_id: reg.event_id,
    user_id: auth.user.id,
    action: isToggle
      ? "ADMIN_AIRPORT_ASSIGNMENT_CHANGED"
      : "ADMIN_AIRPORT_FLIGHT_INFO_CHANGED",
    entity_type: "registration",
    entity_id: registrationId,
    new_data: {
      confirmation_code: reg.confirmation_code,
      ride_id: rideId,
      direction: ride.direction,
      person_id: personId,
      ...(isToggle ? { assigned } : { flight_info: flightInfo || null }),
    },
  });

  return NextResponse.json({
    success: true,
    ...(isToggle ? { assigned } : { flightInfo: flightInfo ?? "" }),
  });
}
