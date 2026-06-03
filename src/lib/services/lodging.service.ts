import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetch all buildings for a given event, including floors and rooms.
 */
export async function getBuildingsWithRooms(
  supabase: SupabaseClient,
  eventId: string
) {
  const { data, error } = await supabase
    .from("eckcm_buildings")
    .select(
      `
      id, name_en, name_ko, sort_order, is_active,
      eckcm_floors(
        id, floor_number, name_en, sort_order,
        eckcm_rooms(
          id, room_number, capacity, has_ac,
          fee_per_night_cents, is_accessible, is_available
        )
      )
    `
    )
    .eq("event_id", eventId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return { data, error };
}

/**
 * Fetch all pending room assignment groups for an event.
 */
export async function getPendingAssignments(
  supabase: SupabaseClient,
  eventId: string
) {
  const { data, error } = await supabase
    .from("eckcm_groups")
    .select(
      `
      id, display_group_code, room_assign_status, preferences, key_count,
      eckcm_registrations!inner(id, confirmation_code, status)
    `
    )
    .eq("event_id", eventId)
    .eq("room_assign_status", "PENDING")
    .order("created_at", { ascending: true });

  return { data, error };
}

/**
 * Fetch all assigned room groups for an event.
 */
export async function getAssignedRooms(
  supabase: SupabaseClient,
  eventId: string
) {
  const { data, error } = await supabase
    .from("eckcm_room_assignments")
    .select(
      `
      id, assigned_at, notes,
      eckcm_rooms!inner(
        room_number, capacity, has_ac,
        eckcm_floors!inner(
          floor_number, name_en,
          eckcm_buildings!inner(id, name_en, name_ko)
        )
      ),
      eckcm_groups!inner(
        id, display_group_code, room_assign_status,
        eckcm_registrations!inner(confirmation_code)
      )
    `
    )
    .order("assigned_at", { ascending: false });

  return { data, error };
}

/**
 * Assign a room to a group (atomic: insert room_assignment + update group status).
 */
export async function assignRoom(
  supabase: SupabaseClient,
  params: {
    groupId: string;
    roomId: string;
    assignedBy: string;
    notes?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const { groupId, roomId, assignedBy, notes } = params;

  // Atomic guard: only assign if group is still PENDING (prevents double-assignment race)
  const { data: updated } = await supabase
    .from("eckcm_groups")
    .update({ room_assign_status: "ASSIGNED" })
    .eq("id", groupId)
    .eq("room_assign_status", "PENDING")
    .select("id");

  if (!updated?.length) {
    return { success: false, error: "Group is not in PENDING status (may already be assigned)" };
  }

  const { error: insertError } = await supabase
    .from("eckcm_room_assignments")
    .insert({
      group_id: groupId,
      room_id: roomId,
      assigned_by: assignedBy,
      notes: notes ?? null,
    });

  if (insertError) {
    // Rollback group status
    await supabase
      .from("eckcm_groups")
      .update({ room_assign_status: "PENDING" })
      .eq("id", groupId);
    return { success: false, error: insertError.message };
  }

  return { success: true };
}

export interface MyRoom {
  buildingEn: string;
  buildingKo: string | null;
  roomNumber: string;
}

type RoomIdentity = {
  first_name_en: string | null;
  last_name_en: string | null;
  birth_date: string | null;
};

type Embed = Record<string, unknown>;

/** Pick the first object out of a Supabase embed that may be an object or a 1-element array. */
function one(value: unknown): Embed | null {
  if (Array.isArray(value)) return (value[0] as Embed) ?? null;
  return (value as Embed) ?? null;
}

/** Resolve building + room from a `eckcm_rooms` embed (room → floor → building). */
function roomFromEmbed(roomEmbed: unknown): MyRoom | null {
  const room = one(roomEmbed);
  const roomNumber = room?.room_number as string | undefined;
  if (!room || !roomNumber) return null;
  const floor = one(room.eckcm_floors);
  const building = one(floor?.eckcm_buildings);
  return {
    buildingEn: (building?.name_en as string) ?? "",
    buildingKo: (building?.name_ko as string) ?? null,
    roomNumber,
  };
}

/**
 * Resolve the logged-in user's OWN assigned room for display on the dashboard.
 *
 * Registration creates separate person records that are NOT linked via
 * eckcm_user_people, so — like the E-Pass page — we locate the user's own
 * participation by matching name (+ birth_date when both sides have it) against
 * the registrations they created. Two assignment models are checked:
 *   1. Group-level room assignment (eckcm_room_assignments) — most buildings.
 *   2. Willow Hall participant-level assignment (eckcm_willow_assignments).
 *
 * Rooms are assigned independently of an event's active state and as early as
 * the SUBMITTED stage, so this is NOT scoped by active event — it simply
 * surfaces the room of the registration the user is a participant in. Cancelled
 * / refunded registrations are excluded. Returns null when the user has no
 * assigned room yet.
 *
 * Pass an admin (service-role) client: the query is strictly scoped to the
 * user's own registrations, mirroring the E-Pass page which also reads
 * group memberships with the admin client.
 */
export async function getMyRoom(
  admin: SupabaseClient,
  params: {
    userId: string;
    identities: RoomIdentity[];
    fallbackFullName?: string | null;
  }
): Promise<MyRoom | null> {
  const { userId, identities, fallbackFullName } = params;

  // The user's own memberships within non-cancelled registrations they created.
  const { data: memberships } = await admin
    .from("eckcm_group_memberships")
    .select(
      `
      id,
      eckcm_people!inner(first_name_en, last_name_en, birth_date),
      eckcm_groups!inner(
        id,
        eckcm_registrations!inner(created_by_user_id, status),
        eckcm_room_assignments(
          eckcm_rooms(
            room_number,
            eckcm_floors(
              name_en,
              eckcm_buildings(name_en, name_ko)
            )
          )
        )
      )
    `
    )
    .eq("status", "ACTIVE")
    .eq("eckcm_groups.eckcm_registrations.created_by_user_id", userId)
    .in("eckcm_groups.eckcm_registrations.status", ["SUBMITTED", "APPROVED", "PAID"]);

  const isMine = (p: RoomIdentity): boolean => {
    if (identities.length > 0) {
      return identities.some((me) => {
        if (me.first_name_en !== p.first_name_en) return false;
        if (me.last_name_en !== p.last_name_en) return false;
        // Only require birth_date to match when both records carry it.
        if (me.birth_date && p.birth_date) return me.birth_date === p.birth_date;
        return true;
      });
    }
    if (fallbackFullName) {
      const personName = `${p.first_name_en ?? ""} ${p.last_name_en ?? ""}`.toLowerCase().trim();
      return personName === fallbackFullName.toLowerCase().trim();
    }
    return false;
  };

  const mine = ((memberships ?? []) as Record<string, unknown>[]).filter((m) =>
    isMine(one(m.eckcm_people) as RoomIdentity)
  );
  if (mine.length === 0) return null;

  // 1) Prefer a group-level room assignment.
  for (const m of mine) {
    const group = one(m.eckcm_groups as Record<string, unknown>);
    const assignment = one(group?.eckcm_room_assignments as Record<string, unknown>);
    const room = roomFromEmbed(assignment?.eckcm_rooms);
    if (room) return room;
  }

  // 2) Otherwise check Willow Hall participant-level assignment by membership.
  const membershipIds = mine.map((m) => m.id as string);
  const { data: willow } = await admin
    .from("eckcm_willow_assignments")
    .select(
      `
      membership_id,
      eckcm_rooms!inner(
        room_number,
        eckcm_floors!inner(
          name_en,
          eckcm_buildings!inner(name_en, name_ko)
        )
      )
    `
    )
    .in("membership_id", membershipIds)
    .limit(1);

  const willowRow = ((willow ?? []) as Record<string, unknown>[])[0];
  if (willowRow) {
    const room = roomFromEmbed(willowRow.eckcm_rooms);
    if (room) return room;
  }

  return null;
}

/**
 * Get lodging summary stats for an event: total rooms, assigned, available.
 */
export async function getLodgingSummary(
  supabase: SupabaseClient,
  eventId: string
): Promise<{ totalRooms: number; assignedRooms: number; pendingGroups: number }> {
  // Resolve building IDs for this event
  const { data: buildings } = await supabase
    .from("eckcm_buildings")
    .select("id")
    .eq("event_id", eventId);
  const buildingIds = (buildings ?? []).map((b: { id: string }) => b.id);

  // Resolve floor IDs from those buildings
  const { data: floors } = buildingIds.length
    ? await supabase.from("eckcm_floors").select("id").in("building_id", buildingIds)
    : { data: [] };
  const floorIds = (floors ?? []).map((f: { id: string }) => f.id);

  // Resolve group IDs for this event
  const { data: groups } = await supabase
    .from("eckcm_groups")
    .select("id")
    .eq("event_id", eventId);
  const groupIds = (groups ?? []).map((g: { id: string }) => g.id);

  const [roomsResult, assignedResult, pendingResult] = await Promise.all([
    floorIds.length
      ? supabase
          .from("eckcm_rooms")
          .select("id", { count: "exact", head: true })
          .eq("is_available", true)
          .in("floor_id", floorIds)
      : { count: 0 },
    groupIds.length
      ? supabase
          .from("eckcm_room_assignments")
          .select("id", { count: "exact", head: true })
          .in("group_id", groupIds)
      : { count: 0 },
    supabase
      .from("eckcm_groups")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("room_assign_status", "PENDING"),
  ]);

  return {
    totalRooms: roomsResult.count ?? 0,
    assignedRooms: assignedResult.count ?? 0,
    pendingGroups: pendingResult.count ?? 0,
  };
}
