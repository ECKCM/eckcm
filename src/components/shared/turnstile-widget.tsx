"use client";

import { forwardRef, useEffect, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

interface TurnstileWidgetProps {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
}

export const TurnstileWidget = forwardRef<TurnstileInstance, TurnstileWidgetProps>(
  function TurnstileWidget({ onSuccess, onError, onExpire }, ref) {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const [enabled, setEnabled] = useState<boolean | null>(null);

    useEffect(() => {
      fetch("/api/admin/app-config")
        .then((res) => res.json())
        .then((data) => setEnabled(data.turnstile_enabled ?? true))
        .catch(() => setEnabled(true));
    }, []);

    if (!siteKey || enabled === null || enabled === false) return null;

    return (
      <Turnstile
        ref={ref}
        siteKey={siteKey}
        onSuccess={onSuccess}
        onError={onError}
        onExpire={onExpire}
      />
    );
  }
);
