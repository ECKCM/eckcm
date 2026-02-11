"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Locale, defaultLocale, locales } from "./config";
import en from "./en.json";
import ko from "./ko.json";

type Messages = typeof en;

const dictionaries: Record<Locale, Messages> = { en, ko };

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }
  return typeof current === "string" ? current : path;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    const stored = localStorage.getItem("eckcm-locale");
    if (stored && locales.includes(stored as Locale)) {
      setLocaleState(stored as Locale);
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem("eckcm-locale", newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  const t = useCallback(
    (key: string): string => {
      return getNestedValue(
        dictionaries[locale] as unknown as Record<string, unknown>,
        key
      );
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
