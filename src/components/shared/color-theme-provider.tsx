"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { ColorThemeId } from "@/lib/color-theme";
import {
  DEFAULT_COLOR_THEME,
  COLOR_THEME_STORAGE_KEY,
  COLOR_THEME_COOKIE,
  COLOR_THEME_IDS,
} from "@/lib/color-theme";

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
}: {
  children: React.ReactNode;
}) {
  const [colorTheme, setColorThemeState] =
    useState<ColorThemeId>(DEFAULT_COLOR_THEME);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(
      COLOR_THEME_STORAGE_KEY
    ) as ColorThemeId | null;
    if (stored && COLOR_THEME_IDS.includes(stored)) {
      setColorThemeState(stored);
      applyThemeAttribute(stored);
    }
    setMounted(true);
  }, []);

  const setColorTheme = useCallback((theme: ColorThemeId) => {
    setColorThemeState(theme);
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme);
    document.cookie = `${COLOR_THEME_COOKIE}=${theme};path=/;max-age=31536000;SameSite=Lax`;
    applyThemeAttribute(theme);
  }, []);

  // Keep attribute in sync if state changes externally
  useEffect(() => {
    if (!mounted) return;
    applyThemeAttribute(colorTheme);
  }, [colorTheme, mounted]);

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </ColorThemeContext.Provider>
  );
}
