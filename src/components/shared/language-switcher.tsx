"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const toggle = () => setLocale(locale === "en" ? "ko" : "en");

  return (
    <Button variant="ghost" size="icon" onClick={toggle}>
      <span className="flex h-7 w-7 items-center justify-center text-sm font-bold leading-none">
        {locale === "en" ? "한" : "A"}
      </span>
      <span className="sr-only">Switch language</span>
    </Button>
  );
}
