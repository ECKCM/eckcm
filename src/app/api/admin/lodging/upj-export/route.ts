import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import JSZip from "jszip";
import {
  exportBuildingExcel,
  buildOccupancyByRoomNumber,
  BUILDING_FILES,
} from "@/lib/services/upj-lodging";

/**
 * GET /api/admin/lodging/upj-export
 * Exports all 4 UPJ Excel files as a ZIP, each filled in with the room's
 * representative + member 1 (see buildOccupancyByRoomNumber).
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Single source of truth for occupancy, shared with the UPJ staff online table.
  const participantsByRoom = await buildOccupancyByRoomNumber(supabase);

  // Generate updated Excel files in parallel and ZIP them.
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
