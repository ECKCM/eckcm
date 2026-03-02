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

  const { error: insertError } = await supabase
    .from("eckcm_room_assignments")
    .insert({
      group_id: groupId,
      room_id: roomId,
      assigned_by: assignedBy,
      notes: notes ?? null,
    });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  const { error: updateError } = await supabase
    .from("eckcm_groups")
    .update({ room_assign_status: "ASSIGNED" })
    .eq("id", groupId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
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
