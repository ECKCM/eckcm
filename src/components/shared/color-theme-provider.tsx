"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { ColorThemeId } from "@/lib/color-theme";
import { DEFAULT_COLOR_THEME } from "@/lib/color-theme";

interface ColorThemeContextType {
  colorTheme: ColorThemeId;
  setColorTheme: (theme: ColorThemeId) => void;
}

const ColorThemeContext = createContext<ColorThemeContextType>({
  colorTheme: DEFAULT_COLOR_THEME,
  setColorTheme: () => {},
});

export function useColorTheme() {
  return useContext(ColorThemeContext);
}

function applyThemeAttribute(theme: ColorThemeId) {
  if (theme === DEFAULT_COLOR_THEME) {
    document.documentElement.removeAttribute("data-color-theme");
  } else {
    document.documentElement.setAttribute("data-color-theme", theme);
  }
}

export function ColorThemeProvider({
  children,
  initialTheme = DEFAULT_COLOR_THEME,
}: {
  children: React.ReactNode;
  initialTheme?: ColorThemeId;
}) {
  const [colorTheme, setColorThemeState] =
    useState<ColorThemeId>(initialTheme);

  // Optimistic UI update — applies DOM attribute immediately
  const setColorTheme = useCallback((theme: ColorThemeId) => {
    setColorThemeState(theme);
    applyThemeAttribute(theme);
  }, []);

  // Keep attribute in sync with state
  useEffect(() => {
    applyThemeAttribute(colorTheme);
  }, [colorTheme]);

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </ColorThemeContext.Provider>
  );
}
