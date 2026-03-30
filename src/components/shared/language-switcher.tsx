"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n/context";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";

interface LanguageSwitcherProps {
  className?: string;
  variant?: "icon" | "toggle";
}

export function LanguageSwitcher({ className, variant = "icon" }: LanguageSwitcherProps) {
  const { locale, setLocale } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const switchTo = (newLocale: "en" | "ko") => {
    if (newLocale === locale) return;
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

  if (variant === "toggle") {
    return (
      <div className={`inline-flex rounded-lg border bg-background p-1 ${className ?? ""}`}>
        <button
          onClick={() => switchTo("en")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            locale === "en"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          English
        </button>
        <button
          onClick={() => switchTo("ko")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            locale === "ko"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          한국어
        </button>
      </div>
    );
  }

  return (
    <Button variant="ghost" size="icon" onClick={() => switchTo(locale === "en" ? "ko" : "en")} className={className}>
      <span className="flex h-7 w-7 items-center justify-center text-sm font-bold leading-none">
        {locale === "en" ? "한" : "A"}
      </span>
      <span className="sr-only">Switch language</span>
    </Button>
  );
}
