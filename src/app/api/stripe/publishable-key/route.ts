import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return NextResponse.json(
      { error: "Missing eventId" },
      { status: 400 }
    );
  }

  // Get event's stripe_mode
  const { data: event } = await supabase
    .from("eckcm_events")
    .select("stripe_mode")
    .eq("id", eventId)
    .single();

  if (!event) {
    return NextResponse.json(
      { error: "Event not found" },
      { status: 404 }
    );
  }

  const mode = event.stripe_mode as "test" | "live";

  // Get publishable key from app config
  const admin = createAdminClient();
  const field =
    mode === "live"
      ? "stripe_live_publishable_key"
      : "stripe_test_publishable_key";

  const { data: config } = await admin
    .from("eckcm_app_config")
    .select("stripe_test_publishable_key, stripe_live_publishable_key")
    .eq("id", 1)
    .single();

  const publishableKey = (config as Record<string, string | null> | null)?.[field];

  if (!publishableKey) {
    // Fallback to env var
    return NextResponse.json({
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      mode,
      source: "env",
    });
  }

  return NextResponse.json({
    publishableKey,
    mode,
    source: "db",
  });
}
