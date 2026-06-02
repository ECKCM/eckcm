import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { ACTIVE_REGISTRATION_STATUSES } from "@/lib/utils/constants";
import { parseAllBuildings } from "@/lib/services/upj-lodging";

/**
 * GET /api/admin/lodging/upj-rooms
 * Returns all rooms from DB with assignment + participant data.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 1. Fetch rooms + fee categories in parallel (independent queries)
  const [roomsResult, feeCatResult] = await Promise.all([
    supabase
      .from("eckcm_rooms")
      .select(`
        id, room_number, capacity, event_capacity_override, has_ac, is_accessible, is_available, fee_category_code,
        eckcm_floors!inner(
          id, floor_number, name_en, sort_order,
          eckcm_buildings!inner(id, name_en, short_code, sort_order, is_active)
        )
      `),
    supabase
      .from("eckcm_fee_categories")
      .select("code, name_en")
      .like("code", "LODGING_%")
      .eq("is_active", true),
  ]);

  if (roomsResult.error) {
    return NextResponse.json({ error: roomsResult.error.message }, { status: 500 });
  }

  const roomsRaw = roomsResult.data ?? [];
  const feeCategories = feeCatResult.data ?? [];

  const categoryNames = new Map<string, string>();
  for (const fc of feeCategories) {
    categoryNames.set(fc.code, fc.name_en);
  }

  const upjRoomMeta = new Map<
    string,
    {
      type: string;
      hostCapacity: number;
      eventCapacity: number;
      note: string;
      isAvailable: boolean;
    }
  >();
  try {
    const parsedRooms = await parseAllBuildings();
    for (const room of parsedRooms) {
      upjRoomMeta.set(room.roomNumber, {
        type: room.type,
        hostCapacity: room.hostCapacity,
        eventCapacity: room.eventCapacity,
        note: room.note,
        isAvailable: room.isAvailable,
      });
    }
  } catch (error) {
    console.error("Failed to parse UPJ room metadata", error);
  }

  // 2. Fetch room assignments with group + participant data
  const roomIds = roomsRaw.map((r: { id: string }) => r.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let assignmentsRaw: any[] = [];
  if (roomIds.length > 0) {
    const { data } = await supabase
      .from("eckcm_room_assignments")
      .select(`
        id, room_id, group_id,
        eckcm_groups!inner(
          display_group_code,
          eckcm_registrations!inner(id, confirmation_code, start_date, end_date, status, notes, additional_requests),
          eckcm_group_memberships(
            eckcm_people(first_name_en, last_name_en, display_name_ko)
          )
        )
      `)
      .in("room_id", roomIds);

    assignmentsRaw = data ?? [];
  }

  // Build assignment map: room_id → assignments. A room can hold multiple groups.
  const assignmentMap = new Map<string, {
    assignmentId: string;
    groupId: string;
    groupCode: string;
    registrationId: string;
    confirmationCode: string;
    notes: string | null;
    additionalRequests: string | null;
    participants: { firstName: string; lastName: string; displayNameKo: string | null; arrival: string | null; departure: string | null }[];
  }[]>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of assignmentsRaw as any[]) {
    const group = a.eckcm_groups;
    if (!group) continue;
    const reg = Array.isArray(group.eckcm_registrations)
      ? group.eckcm_registrations[0]
      : group.eckcm_registrations;
    if (!reg || !ACTIVE_REGISTRATION_STATUSES.includes(reg.status)) continue;

    const memberships = (group.eckcm_group_memberships ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((m: any) => m.eckcm_people);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const participants = memberships.map((m: any) => ({
      firstName: m.eckcm_people.first_name_en ?? "",
      lastName: m.eckcm_people.last_name_en ?? "",
      displayNameKo: m.eckcm_people.display_name_ko ?? null,
      arrival: reg.start_date ?? null,
      departure: reg.end_date ?? null,
    }));

    const existing = assignmentMap.get(a.room_id) ?? [];
    existing.push({
      assignmentId: a.id,
      groupId: a.group_id,
      groupCode: group.display_group_code ?? "",
      registrationId: reg.id ?? "",
      confirmationCode: reg.confirmation_code ?? "",
      notes: reg.notes ?? null,
      additionalRequests: reg.additional_requests ?? null,
      participants,
    });
    assignmentMap.set(a.room_id, existing);
  }

  // 2b. Willow Hall participant-level assignments (per-person, not group-based).
  // Merge their occupants into the room participant lists so they show here too.
  const WILLOW_CATEGORIES = ["LODGING_WILLOW_EM", "LODGING_WILLOW_HANSAMO"];
  const willowByRoom = new Map<
    string,
    { firstName: string; lastName: string; displayNameKo: string | null; arrival: string | null; departure: string | null }[]
  >();
  if (roomIds.length > 0) {
    const { data: willowRaw } = await supabase
      .from("eckcm_willow_assignments")
      .select(`
        room_id, assigned_at,
        eckcm_group_memberships!inner(
          stay_start_date, stay_end_date,
          eckcm_people!inner(first_name_en, last_name_en, display_name_ko),
          eckcm_groups!inner(eckcm_registrations!inner(start_date, end_date, status))
        )
      `)
      .in("room_id", roomIds)
      .order("assigned_at", { ascending: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const w of (willowRaw ?? []) as any[]) {
      const m = w.eckcm_group_memberships;
      const person = m?.eckcm_people;
      if (!person) continue;
      const reg = Array.isArray(m.eckcm_groups?.eckcm_registrations)
        ? m.eckcm_groups.eckcm_registrations[0]
        : m.eckcm_groups?.eckcm_registrations;
      if (!reg || !ACTIVE_REGISTRATION_STATUSES.includes(reg.status)) continue;

      const arr = willowByRoom.get(w.room_id) ?? [];
      arr.push({
        firstName: person.first_name_en ?? "",
        lastName: person.last_name_en ?? "",
        displayNameKo: person.display_name_ko ?? null,
        arrival: m.stay_start_date ?? reg.start_date ?? null,
        departure: m.stay_end_date ?? reg.end_date ?? null,
      });
      willowByRoom.set(w.room_id, arr);
    }
  }

  // 3. Build response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rooms = (roomsRaw as any[]).map((r: any) => {
    const floor = r.eckcm_floors;
    const building = floor?.eckcm_buildings;
    if (!building || !building.is_active) return null;

    const assignments = assignmentMap.get(r.id) ?? [];
    const firstAssignment = assignments[0];
    const feeCode = r.fee_category_code ?? "";
    const meta = upjRoomMeta.get(r.room_number);
    const type = meta?.type ?? (r.capacity <= 2 ? "Single" : "Double");
    const isWillow = WILLOW_CATEGORIES.includes(feeCode);
    // Willow rooms are per-person (0–2) — default the event capacity to the room's
    // physical capacity instead of the type-derived value.
    const derivedEventCapacity = isWillow
      ? r.capacity
      : meta?.eventCapacity ?? (type === "Double" ? 6 : 2);
    const eventCapacity =
      r.event_capacity_override != null ? r.event_capacity_override : derivedEventCapacity;
    const willowParticipants = willowByRoom.get(r.id) ?? [];
    const participants = [
      ...assignments.flatMap((assignment) => assignment.participants),
      ...willowParticipants,
    ];
    const notes = [
      meta?.note ?? "",
      r.is_accessible ? "ADA" : "",
      !r.is_available || meta?.isAvailable === false ? "NOT AVAILABLE" : "",
    ].filter(Boolean);

    return {
      dbRoomId: r.id,
      roomNumber: r.room_number,
      building: building.name_en,
      buildingCode: building.short_code ?? "",
      floor: floor.floor_number,
      floorName: floor.name_en ?? `Floor ${floor.floor_number}`,
      type,
      capacity: r.capacity,
      hostCapacity: meta?.hostCapacity ?? (type === "Double" ? 2 : 1),
      eventCapacity,
      eventCapacityOverride: r.event_capacity_override ?? null,
      eventCapacityDefault: derivedEventCapacity,
      hasAc: r.has_ac,
      isAccessible: r.is_accessible,
      isAvailable: r.is_available,
      lodgingCategory: feeCode,
      lodgingCategoryName: categoryNames.get(feeCode) ?? "",
      note: Array.from(new Set(notes)).join("; "),
      assignmentId: firstAssignment?.assignmentId ?? null,
      groupId: firstAssignment?.groupId ?? null,
      groupCode: assignments.length
        ? assignments.map((assignment) => assignment.groupCode).filter(Boolean).join(", ")
        : null,
      participants,
      assignments,
    };
  }).filter(Boolean);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rooms.sort((a: any, b: any) => {
    if (a.building !== b.building) return a.building.localeCompare(b.building);
    if (a.floor !== b.floor) return a.floor - b.floor;
    return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
  });

  const categoryOptions = feeCategories.map((fc) => ({
    code: fc.code,
    name: fc.name_en,
  }));

  return NextResponse.json({ rooms, categories: categoryOptions });
}

/**
 * PATCH /api/admin/lodging/upj-rooms
 * Update editable room fields inline from the UPJ Lodging Rooms page.
 * Accepts any subset of: categoryCode, eventCapacityOverride, hasAc, isAvailable.
 */
export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { roomId } = body;
  if (!roomId) {
    return NextResponse.json({ error: "roomId is required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};

  if ("categoryCode" in body) {
    update.fee_category_code = body.categoryCode || null;
  }
  if ("eventCapacityOverride" in body) {
    const raw = body.eventCapacityOverride;
    if (raw === null || raw === "") {
      update.event_capacity_override = null; // clear → fall back to type-derived default
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json(
          { error: "eventCapacityOverride must be a non-negative integer or null" },
          { status: 400 }
        );
      }
      update.event_capacity_override = n;
    }
  }
  if ("hasAc" in body) {
    update.has_ac = Boolean(body.hasAc);
  }
  if ("isAvailable" in body) {
    update.is_available = Boolean(body.isAvailable);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("eckcm_rooms")
    .update(update)
    .eq("id", roomId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
