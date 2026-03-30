import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelRegistration } from "@/lib/services/registration.service";
import { recalculateInventorySafe } from "@/lib/services/inventory.service";
import { syncRegistration } from "@/lib/services/google-sheets.service";
import { logger } from "@/lib/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: registrationId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = body.reason as string | undefined;

  const result = await cancelRegistration(supabase, {
    registrationId,
    userId: user.id,
    reason,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  // Update inventory counts
  const admin = createAdminClient();
  await recalculateInventorySafe(admin);

  // Sync to Google Sheets
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("event_id")
    .eq("id", registrationId)
    .single();
  if (reg) {
    syncRegistration(reg.event_id, registrationId).catch((err) =>
      logger.error("[registration/cancel] Google Sheets sync failed", { error: String(err) })
    );
  }

  return NextResponse.json({ success: true });
}
