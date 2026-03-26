"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error("[public] Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold">{t("common.somethingWentWrong")}</h2>
      <p className="text-muted-foreground text-sm">
        {t("common.unexpectedError")}
      </p>
      <Button onClick={reset}>{t("common.tryAgain")}</Button>
    </div>
  );
}
