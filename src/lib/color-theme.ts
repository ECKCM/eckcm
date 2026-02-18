export const COLOR_THEMES = {
  eckcm: {
    id: "eckcm" as const,
    name: "ECKCM",
    description: "Green — Eastern Korean Churches Camp Meeting",
    colors: {
      primary: "#4a9e3f",
      secondary: "#81c784",
      accent: "#c8e6c9",
      gold: "#2e7d32",
    },
  },
  upj: {
    id: "upj" as const,
    name: "UPJ",
    description: "Blue & Gold — University of Pittsburgh at Johnstown",
    colors: {
      primary: "#003594",
      secondary: "#ffb81c",
      accent: "#dbeeff",
      gold: "#ffb81c",
    },
  },
} as const;

export type ColorThemeId = keyof typeof COLOR_THEMES;

export const DEFAULT_COLOR_THEME: ColorThemeId = "eckcm";

export const COLOR_THEME_IDS = Object.keys(COLOR_THEMES) as ColorThemeId[];
