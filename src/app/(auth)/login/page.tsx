"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { TurnstileWidget } from "@/components/shared/turnstile-widget";
import { createClient } from "@/lib/supabase/client";
import { logAuthEvent } from "@/lib/audit-client";
import { sanitizeEmailInput } from "@/lib/utils/field-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/shared/password-input";
import { Label } from "@/components/ui/label";
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

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string>();
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [callbackError, setCallbackError] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "auth_callback_error") {
      setCallbackError(true);
    }
    if (params.get("message") === "password_updated") {
      setPasswordUpdated(true);
    }
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });

    if (error) {
      setLoginError(error.message);
      setCaptchaToken(undefined);
      turnstileRef.current?.reset();
      setLoading(false);
      return;
    }

    logAuthEvent("USER_LOGIN", { method: "email" });
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">{t("common.appName")}</CardTitle>
        <CardDescription>{t("auth.signInTitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {callbackError && (
          <p className="text-sm text-center text-destructive">
            {t("auth.authFailed")}
          </p>
        )}
        {passwordUpdated && (
          <p className="text-sm text-center text-green-600">
            {t("auth.passwordUpdated")}
          </p>
        )}
        <OAuthButtons />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              {t("auth.orContinueWithEmail")}
            </span>
          </div>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-3" suppressHydrationWarning>
          <div className="space-y-1">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(sanitizeEmailInput(e.target.value));
                setLoginError("");
              }}
              placeholder="email@example.com"
              required
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setLoginError("");
              }}
              placeholder="••••••••"
              required
            />
            {loginError && (
              <p className="text-xs text-destructive">{loginError}</p>
            )}
          </div>
          <TurnstileWidget
            ref={turnstileRef}
            onSuccess={setCaptchaToken}
            onExpire={() => setCaptchaToken(undefined)}
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.signingIn") : t("common.signIn")}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          {t("auth.noAccount")}{" "}
          <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
            {t("common.signUp")}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
