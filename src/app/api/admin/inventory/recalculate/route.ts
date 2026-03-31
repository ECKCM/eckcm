import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalculateInventory } from "@/lib/services/inventory.service";
import { logger } from "@/lib/logger";

export async function POST() {
  try {
    const admin = createAdminClient();
    await recalculateInventory(admin);
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[admin/inventory/recalculate] Failed", {
      error: String(err),
    });
    return NextResponse.json(
      { error: "Recalculation failed" },
      { status: 500 }
    );
  }
}
