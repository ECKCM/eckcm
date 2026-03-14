import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteDraftRegistration } from "@/lib/services/registration.service";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId, registrationId } = await request.json();

    if (!eventId) {
      return NextResponse.json(
        { error: "eventId is required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Find DRAFT registrations to delete
    let query = admin
      .from("eckcm_registrations")
      .select("id")
      .eq("event_id", eventId)
      .eq("created_by_user_id", user.id)
      .eq("status", "DRAFT");

    if (registrationId) {
      query = query.eq("id", registrationId);
    }

    const { data: drafts, error: findError } = await query;

    if (findError) {
      logger.error("[cancel-drafts] Failed to find drafts", {
        error: String(findError),
        userId: user.id,
        eventId,
      });
      return NextResponse.json(
        { error: "Failed to find drafts" },
        { status: 500 }
      );
    }

    // Delete each draft registration and all related records
    for (const draft of drafts ?? []) {
      try {
        await deleteDraftRegistration(admin, draft.id);
      } catch (err) {
        logger.error("[cancel-drafts] Failed to delete draft", {
          registrationId: draft.id,
          error: String(err),
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[cancel-drafts] Unhandled error", { error: String(err) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
