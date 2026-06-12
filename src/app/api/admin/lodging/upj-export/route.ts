import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { generateUpjExportZip } from "@/lib/services/upj-lodging";

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

  const zipBuffer = await generateUpjExportZip(createAdminClient());

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="UPJ-Lodging-Export-${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  });
}
