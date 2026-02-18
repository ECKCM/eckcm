import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_COLOR_THEME, COLOR_THEME_IDS } from "@/lib/color-theme";
import type { ColorThemeId } from "@/lib/color-theme";

/**
 * Fetch the global color theme from eckcm_app_config.
 * Server-only — called from layout.tsx.
 */
export async function getAppColorTheme(): Promise<ColorThemeId> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("eckcm_app_config")
      .select("color_theme")
      .eq("id", 1)
      .single();

    const theme = data?.color_theme as ColorThemeId | undefined;
    if (theme && COLOR_THEME_IDS.includes(theme)) {
      return theme;
    }
  } catch {
    // Fall through to default
  }
  return DEFAULT_COLOR_THEME;
}
