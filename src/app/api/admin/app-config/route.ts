import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COLOR_THEME_IDS } from "@/lib/color-theme";
import type { ColorThemeId } from "@/lib/color-theme";

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eckcm_app_config")
    .select("color_theme, turnstile_enabled, allow_duplicate_email")
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
  });
}

export async function PATCH(request: Request) {
  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. SUPER_ADMIN check
  const { data: assignments } = await supabase
    .from("eckcm_staff_assignments")
    .select("id, eckcm_roles(name)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const isSuperAdmin = assignments?.some(
    (a) =>
      a.eckcm_roles &&
      (a.eckcm_roles as unknown as { name: string }).name === "SUPER_ADMIN"
  );

  if (!isSuperAdmin) {
    return NextResponse.json(
      { error: "Only SUPER_ADMIN can update app config" },
      { status: 403 }
    );
  }

  // 3. Validate body
  const body = await request.json();

  const updates: Record<string, unknown> = {};

  if ("color_theme" in body) {
    const colorTheme = body.color_theme as ColorThemeId;
    if (!colorTheme || !COLOR_THEME_IDS.includes(colorTheme)) {
      return NextResponse.json(
        { error: `Invalid color_theme. Must be one of: ${COLOR_THEME_IDS.join(", ")}` },
        { status: 400 }
      );
    }
    updates.color_theme = colorTheme;
  }

  if ("turnstile_enabled" in body) {
    if (typeof body.turnstile_enabled !== "boolean") {
      return NextResponse.json(
        { error: "turnstile_enabled must be a boolean" },
        { status: 400 }
      );
    }
    updates.turnstile_enabled = body.turnstile_enabled;
  }

  if ("allow_duplicate_email" in body) {
    if (typeof body.allow_duplicate_email !== "boolean") {
      return NextResponse.json(
        { error: "allow_duplicate_email must be a boolean" },
        { status: 400 }
      );
    }
    updates.allow_duplicate_email = body.allow_duplicate_email;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // 4. Update DB
  const admin = createAdminClient();
  const { error } = await admin
    .from("eckcm_app_config")
    .update(updates)
    .eq("id", 1);

  if (error) {
    return NextResponse.json(
      { error: "Failed to update config" },
      { status: 500 }
    );
  }

  // 5. Audit log
  await admin.from("eckcm_audit_logs").insert({
    user_id: user.id,
    action: "UPDATE_APP_CONFIG",
    entity_type: "app_config",
    entity_id: "1",
    new_data: updates,
  });

  return NextResponse.json({ success: true, ...updates });
}
