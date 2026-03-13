import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

    // Build query: cancel DRAFT registrations for this user + event
    let query = admin
      .from("eckcm_registrations")
      .update({ status: "CANCELLED" })
      .eq("event_id", eventId)
      .eq("created_by_user_id", user.id)
      .eq("status", "DRAFT");

    // If a specific registrationId is provided, only cancel that one
    if (registrationId) {
      query = query.eq("id", registrationId);
    }

    const { error } = await query;

    if (error) {
      logger.error("[cancel-drafts] Failed to cancel drafts", {
        error: String(error),
        userId: user.id,
        eventId,
      });
      return NextResponse.json(
        { error: "Failed to cancel drafts" },
        { status: 500 }
      );
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
