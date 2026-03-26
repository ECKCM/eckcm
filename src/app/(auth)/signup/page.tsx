"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { useI18n } from "@/lib/i18n/context";

export default function SignupPage() {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">{t("common.appName")}</CardTitle>
        <CardDescription>{t("auth.createAccount")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <OAuthButtons />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              {t("auth.orRegisterWithEmail")}
            </span>
          </div>
        </div>

        <Button asChild variant="outline" className="w-full">
          <Link href="/signup/complete-profile">{t("auth.signUpWithEmail")}</Link>
        </Button>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          {t("auth.hasAccount")}{" "}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            {t("common.signIn")}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
