import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TitleIcon } from "@/components/admin/title-icons";

/**
 * Preset palette for participant titles. Medium/dark hues so white text stays
 * legible on the colored badge. Stored as plain hex on eckcm_participant_titles.color.
 */
export const TITLE_COLORS = [
  "#2563eb", // blue
  "#1d4ed8", // blue (dark)
  "#0284c7", // sky
  "#0891b2", // cyan
  "#0d9488", // teal
  "#059669", // emerald
  "#16a34a", // green
  "#65a30d", // lime
  "#ca8a04", // yellow
  "#d97706", // amber
  "#ea580c", // orange
  "#dc2626", // red
  "#e11d48", // rose
  "#db2777", // pink
  "#c026d3", // fuchsia
  "#9333ea", // purple
  "#7c3aed", // violet
  "#4f46e5", // indigo
  "#0f766e", // teal (dark)
  "#b45309", // amber (dark)
  "#b91c1c", // red (dark)
  "#475569", // slate
  "#57534e", // stone
  "#334155", // slate (dark)
  "#9ca3af", // gray (light)
  "#e5e7eb", // gray (very light)
] as const;

/**
 * Picks a legible text color (black or white) for a given badge background,
 * so light swatches like the light gray stay readable.
 */
export function titleTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Relative luminance (sRGB) — light backgrounds get dark text.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1f2937" : "#fff";
}

/** Renders a participant title as a colored badge (or a neutral one if no color). */
export function TitleBadge({
  name,
  color,
  icon,
  className,
}: {
  name: string;
  color?: string | null;
  icon?: string | null;
  className?: string;
}) {
  const content = (
    <>
      <TitleIcon name={icon} className="mr-1 size-3.5 shrink-0" />
      {name}
    </>
  );

  if (color) {
    const textColor = titleTextColor(color);
    // Light badges need dark text — give them a subtle border so the near-white
    // ones don't blend into a light background.
    const borderColor = textColor === "#fff" ? color : "rgba(0,0,0,0.15)";
    return (
      <Badge
        className={cn("inline-flex items-center", className)}
        style={{ backgroundColor: color, borderColor, color: textColor }}
      >
        {content}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className={cn("inline-flex items-center", className)}>
      {content}
    </Badge>
  );
}
