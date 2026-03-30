"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/context";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error("[auth] Unhandled error:", error);
  }, [error]);

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("common.somethingWentWrong")}</CardTitle>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-muted-foreground text-sm">
          {t("common.unexpectedError")}
        </p>
      </CardContent>
      <CardFooter className="justify-center">
        <Button onClick={reset}>{t("common.tryAgain")}</Button>
      </CardFooter>
    </Card>
  );
}
