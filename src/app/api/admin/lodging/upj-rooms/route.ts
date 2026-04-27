import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { ACTIVE_REGISTRATION_STATUSES } from "@/lib/utils/constants";

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
        id, room_number, capacity, has_ac, is_accessible, is_available, fee_category_code,
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
          eckcm_registrations!inner(start_date, end_date, status),
          eckcm_group_memberships(
            sort_order,
            eckcm_people(first_name_en, last_name_en, display_name_ko)
          )
        )
      `)
      .in("room_id", roomIds);

    assignmentsRaw = data ?? [];
  }

  // Build assignment map: room_id → { groupCode, participants }
  const assignmentMap = new Map<string, {
    assignmentId: string;
    groupId: string;
    groupCode: string;
    participants: { firstName: string; lastName: string; displayNameKo: string | null; arrival: string | null; departure: string | null }[];
  }>();

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
      .filter((m: any) => m.eckcm_people)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const participants = memberships.map((m: any) => ({
      firstName: m.eckcm_people.first_name_en ?? "",
      lastName: m.eckcm_people.last_name_en ?? "",
      displayNameKo: m.eckcm_people.display_name_ko ?? null,
      arrival: reg.start_date ?? null,
      departure: reg.end_date ?? null,
    }));

    const existing = assignmentMap.get(a.room_id);
    if (existing) {
      existing.participants.push(...participants);
    } else {
      assignmentMap.set(a.room_id, {
        assignmentId: a.id,
        groupId: a.group_id,
        groupCode: group.display_group_code ?? "",
        participants,
      });
    }
  }

  // 3. Build response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rooms = (roomsRaw as any[]).map((r: any) => {
    const floor = r.eckcm_floors;
    const building = floor?.eckcm_buildings;
    if (!building || !building.is_active) return null;

    const assignment = assignmentMap.get(r.id);
    const feeCode = r.fee_category_code ?? "";
    const type = r.capacity <= 2 ? "Single" : "Double";

    return {
      dbRoomId: r.id,
      roomNumber: r.room_number,
      building: building.name_en,
      buildingCode: building.short_code ?? "",
      floor: floor.floor_number,
      floorName: floor.name_en ?? `Floor ${floor.floor_number}`,
      type,
      capacity: r.capacity,
      hostCapacity: type === "Double" ? 2 : 1,
      eventCapacity: type === "Double" ? 6 : 2,
      hasAc: r.has_ac,
      isAccessible: r.is_accessible,
      isAvailable: r.is_available,
      lodgingCategory: feeCode,
      lodgingCategoryName: categoryNames.get(feeCode) ?? "",
      note: [
        r.is_accessible ? "ADA" : "",
        !r.is_available ? "NOT AVAILABLE" : "",
      ].filter(Boolean).join("; "),
      assignmentId: assignment?.assignmentId ?? null,
      groupId: assignment?.groupId ?? null,
      groupCode: assignment?.groupCode ?? null,
      participants: assignment?.participants ?? [],
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
 * Update a room's fee_category_code.
 */
export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId, categoryCode } = await request.json();
  if (!roomId || !categoryCode) {
    return NextResponse.json({ error: "roomId and categoryCode are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("eckcm_rooms")
    .update({ fee_category_code: categoryCode })
    .eq("id", roomId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
