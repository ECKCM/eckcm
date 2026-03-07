import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eckcm_app_config")
    .select(
      "color_theme, turnstile_enabled, allow_duplicate_email, allow_duplicate_registration"
    )
    .eq("id", 1)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to fetch config" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    color_theme: data.color_theme,
    turnstile_enabled: data.turnstile_enabled ?? true,
    allow_duplicate_email: data.allow_duplicate_email ?? false,
    allow_duplicate_registration: data.allow_duplicate_registration ?? false,
  });
}
