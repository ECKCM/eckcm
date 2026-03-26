"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";

function CheckEmailContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  return (
    <Card className="bg-muted/50">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <Mail className="h-10 w-10 text-primary" />
        </div>
        <CardTitle className="text-2xl font-bold">{t("auth.checkEmail")}</CardTitle>
        <CardDescription>
          {t("auth.sentConfirmationTo")}
          {email && (
            <span className="block mt-1 font-medium text-foreground">{email}</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-center text-sm text-muted-foreground">
        <p>
          {t("auth.clickConfirmLink")}
        </p>
        <p>
          {t("auth.noEmailReceived")}{" "}
          <Link href="/signup" className="underline text-primary hover:text-primary/80">
            {t("auth.trySignupAgain")}
          </Link>
          .
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/login">{t("auth.backToLogin")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense>
      <CheckEmailContent />
    </Suspense>
  );
}
