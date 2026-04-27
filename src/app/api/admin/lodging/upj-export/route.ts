import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { ACTIVE_REGISTRATION_STATUSES } from "@/lib/utils/constants";
import JSZip from "jszip";
import {
  parseAllBuildings,
  exportBuildingExcel,
  BUILDING_FILES,
  type AssignedParticipant,
} from "@/lib/services/upj-lodging";

/**
 * GET /api/admin/lodging/upj-export
 * Exports all 4 UPJ Excel files as a ZIP, with assignment data filled in.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Parse Excel + query DB rooms in parallel (independent)
  const [upjRooms, { data: dbRooms }] = await Promise.all([
    parseAllBuildings(),
    supabase
      .from("eckcm_rooms")
      .select("id, room_number"),
  ]);

  const roomIdByNumber = new Map<string, string>();
  for (const r of dbRooms ?? []) {
    roomIdByNumber.set(r.room_number, r.id);
  }

  const dbRoomIds = (dbRooms ?? []).map((r) => r.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let assignmentsRaw: any[] = [];
  if (dbRoomIds.length > 0) {
    const { data } = await supabase
      .from("eckcm_room_assignments")
      .select(`
        id, room_id,
        eckcm_groups!inner(
          eckcm_registrations!inner(start_date, end_date, status),
          eckcm_group_memberships(
            sort_order,
            eckcm_people(first_name_en, last_name_en)
          )
        )
      `)
      .in("room_id", dbRoomIds);

    assignmentsRaw = data ?? [];
  }

  // Build map: room_number → participants
  const participantsByRoom = new Map<string, AssignedParticipant[]>();

  const numberByRoomId = new Map<string, string>();
  for (const [num, id] of roomIdByNumber) {
    numberByRoomId.set(id, num);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of assignmentsRaw as any[]) {
    const roomNumber = numberByRoomId.get(a.room_id);
    if (!roomNumber) continue;

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
    const participants: AssignedParticipant[] = memberships.map((m: any) => ({
      firstName: m.eckcm_people.first_name_en ?? "",
      lastName: m.eckcm_people.last_name_en ?? "",
      displayNameKo: null,
      arrival: reg.start_date ?? null,
      departure: reg.end_date ?? null,
    }));

    const existing = participantsByRoom.get(roomNumber);
    if (existing) {
      existing.push(...participants);
    } else {
      participantsByRoom.set(roomNumber, participants);
    }
  }

  // Generate updated Excel files in parallel and ZIP them
  const buffers = await Promise.all(
    BUILDING_FILES.map((_, i) => exportBuildingExcel(i, participantsByRoom))
  );

  const zip = new JSZip();
  for (let i = 0; i < BUILDING_FILES.length; i++) {
    zip.file(BUILDING_FILES[i].filename, buffers[i]);
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="UPJ-Lodging-Export-${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  });
}
