import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseAllBuildings,
  buildOccupancyByRoomNumber,
  upjTokenMatches,
  BUILDING_FILES,
} from "@/lib/services/upj-lodging";
import { UPJLodgingTable, type PublicBuilding } from "./upj-lodging-table";

// Capability URL — never index, and always render live.
export const metadata: Metadata = {
  title: "2026 ECKCM UPJ Lodging — Staff View",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function UPJLodgingStaffPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const admin = createAdminClient();

  // Validate the capability token against the same secret e-pass links use.
  const { data: appConfig } = await admin
    .from("eckcm_app_config")
    .select("epass_hmac_secret")
    .eq("id", 1)
    .single();

  const secret = (appConfig as { epass_hmac_secret?: string | null } | null)
    ?.epass_hmac_secret;

  if (!upjTokenMatches(decodeURIComponent(token), secret)) {
    notFound();
  }

  // Parse the room inventory + live occupancy (representative + member 1 per room).
  const [rooms, occupancy] = await Promise.all([
    parseAllBuildings(),
    buildOccupancyByRoomNumber(admin),
  ]);

  // Group rooms by building (in template order) → floor → room.
  const order = new Map<string, number>(
    BUILDING_FILES.map((b, i) => [b.code, i]),
  );
  const buildingMap = new Map<string, PublicBuilding>();

  for (const room of rooms) {
    let building = buildingMap.get(room.buildingCode);
    if (!building) {
      building = { code: room.buildingCode, name: room.building, floors: [] };
      buildingMap.set(room.buildingCode, building);
    }

    let floor = building.floors.find((f) => f.floor === room.floor);
    if (!floor) {
      floor = { floor: room.floor, rooms: [] };
      building.floors.push(floor);
    }

    const occupants = (occupancy.get(room.roomNumber) ?? []).map((o, i) => ({
      firstName: o.firstName,
      lastName: o.lastName,
      arrival: o.arrival,
      departure: o.departure,
      isRep: i === 0,
    }));

    floor.rooms.push({
      roomNumber: room.roomNumber,
      type: room.type,
      isAvailable: room.isAvailable,
      occupants,
    });
  }

  const buildings = Array.from(buildingMap.values()).sort(
    (a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99),
  );
  for (const b of buildings) {
    b.floors.sort((a, c) => a.floor - c.floor);
  }

  const generatedAt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  return (
    <UPJLodgingTable
      buildings={buildings}
      generatedAt={generatedAt}
      token={token}
    />
  );
}
