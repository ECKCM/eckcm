import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TitleIcon } from "@/components/admin/title-icons";

/**
 * Preset palette for participant titles. Medium/dark hues so white text stays
 * legible on the colored badge. Stored as plain hex on eckcm_participant_titles.color.
 */
export const TITLE_COLORS = [
  "#2563eb", // blue
  "#16a34a", // green
  "#d97706", // amber
  "#dc2626", // red
  "#7c3aed", // violet
  "#db2777", // pink
  "#0d9488", // teal
  "#475569", // slate
] as const;

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
    return (
      <Badge
        className={cn("inline-flex items-center", className)}
        style={{ backgroundColor: color, borderColor: color, color: "#fff" }}
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
