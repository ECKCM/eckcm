"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n/context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const toggle = () => {
    const newLocale = locale === "en" ? "ko" : "en";
    setLocale(newLocale);

    // Sync to DB (fire-and-forget)
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase
          .from("eckcm_users")
          .update({ locale: newLocale })
          .eq("id", user.id)
          .then(() => {});
      }
    });
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggle}>
      <span className="flex h-7 w-7 items-center justify-center text-sm font-bold leading-none">
        {locale === "en" ? "A" : "한"}
      </span>
      <span className="sr-only">Switch language</span>
    </Button>
  );
}
