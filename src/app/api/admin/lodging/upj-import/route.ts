import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { parseAllBuildings, BUILDING_FILES } from "@/lib/services/upj-lodging";

/**
 * POST /api/admin/lodging/upj-import
 * Import UPJ Excel room data into DB tables (buildings, floors, rooms).
 * Send { force: true } to delete existing data and re-import.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const body = await request.json().catch(() => ({}));

  // Check if buildings already exist
  const { count: existingCount } = await supabase
    .from("eckcm_buildings")
    .select("id", { count: "exact", head: true });

  if (existingCount && existingCount > 0) {
    if (!body.force) {
      return NextResponse.json(
        { error: "Buildings already exist. Use force: true to delete and re-import." },
        { status: 409 }
      );
    }

    // Delete in order: rooms → floors → buildings (no cascade)
    const { data: buildings } = await supabase.from("eckcm_buildings").select("id");
    const buildingIds = (buildings ?? []).map((b) => b.id);
    if (buildingIds.length > 0) {
      const { data: floors } = await supabase.from("eckcm_floors").select("id").in("building_id", buildingIds);
      const floorIds = (floors ?? []).map((f) => f.id);
      if (floorIds.length > 0) {
        await supabase.from("eckcm_rooms").delete().in("floor_id", floorIds);
      }
      await supabase.from("eckcm_floors").delete().in("building_id", buildingIds);
    }
    await supabase.from("eckcm_buildings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  }

  // Parse all 4 Excel files
  const upjRooms = await parseAllBuildings();

  // Group rooms by building code
  const roomsByBuilding = new Map<string, typeof upjRooms>();
  for (const room of upjRooms) {
    const arr = roomsByBuilding.get(room.buildingCode) ?? [];
    arr.push(room);
    roomsByBuilding.set(room.buildingCode, arr);
  }

  let totalRooms = 0;

  for (let i = 0; i < BUILDING_FILES.length; i++) {
    const bf = BUILDING_FILES[i];
    const rooms = roomsByBuilding.get(bf.code) ?? [];
    if (rooms.length === 0) continue;

    const { data: building, error: bErr } = await supabase
      .from("eckcm_buildings")
      .insert({
        name_en: bf.building,
        short_code: bf.code,
        sort_order: i,
        is_active: true,
      })
      .select("id")
      .single();

    if (bErr || !building) {
      return NextResponse.json({ error: `Failed to create building ${bf.code}: ${bErr?.message}` }, { status: 500 });
    }

    const roomsByFloor = new Map<number, typeof rooms>();
    for (const room of rooms) {
      const arr = roomsByFloor.get(room.floor) ?? [];
      arr.push(room);
      roomsByFloor.set(room.floor, arr);
    }

    const sortedFloors = Array.from(roomsByFloor.keys()).sort((a, b) => a - b);

    for (const floorNum of sortedFloors) {
      const floorRooms = roomsByFloor.get(floorNum) ?? [];

      const { data: floor, error: fErr } = await supabase
        .from("eckcm_floors")
        .insert({
          building_id: building.id,
          floor_number: floorNum,
          name_en: `Floor ${floorNum}`,
          sort_order: floorNum,
        })
        .select("id")
        .single();

      if (fErr || !floor) {
        return NextResponse.json({ error: `Failed to create floor ${floorNum} in ${bf.code}: ${fErr?.message}` }, { status: 500 });
      }

      const roomInserts = floorRooms.map((room) => ({
        floor_id: floor.id,
        room_number: room.roomNumber,
        capacity: room.eventCapacity,
        has_ac: bf.code === "LLC",
        fee_per_night_cents: 0,
        is_accessible: false,
        is_available: room.isAvailable,
        fee_category_code: room.lodgingCategory || null,
      }));

      const { error: rErr } = await supabase
        .from("eckcm_rooms")
        .insert(roomInserts);

      if (rErr) {
        return NextResponse.json({ error: `Failed to create rooms on floor ${floorNum} in ${bf.code}: ${rErr.message}` }, { status: 500 });
      }

      totalRooms += roomInserts.length;
    }
  }

  return NextResponse.json({
    success: true,
    imported: {
      buildings: BUILDING_FILES.length,
      rooms: totalRooms,
    },
  });
}
