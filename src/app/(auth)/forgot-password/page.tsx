"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { TurnstileWidget } from "@/components/shared/turnstile-widget";
import { createClient } from "@/lib/supabase/client";
import { sanitizeEmailInput } from "@/lib/utils/field-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Mail } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const turnstileRef = useRef<TurnstileInstance>(null);
  const { t } = useI18n();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/callback?next=/reset-password`,
      captchaToken,
    });

    if (error) {
      setError(error.message);
      setCaptchaToken(undefined);
      turnstileRef.current?.reset();
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  if (sent) {
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">{t("auth.checkEmail")}</CardTitle>
          <CardDescription>
            {t("auth.sentResetTo")}{" "}
            <span className="font-medium text-foreground">{email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <p>
            {t("auth.clickResetLink")}
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("auth.backToSignIn")}
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">{t("auth.forgotPasswordTitle")}</CardTitle>
        <CardDescription>
          {t("auth.forgotPasswordDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(sanitizeEmailInput(e.target.value));
                setError("");
              }}
              placeholder="email@example.com"
              required
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <TurnstileWidget
            ref={turnstileRef}
            onSuccess={setCaptchaToken}
            onExpire={() => setCaptchaToken(undefined)}
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.sending") : t("auth.sendResetLink")}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("auth.backToSignIn")}
        </Link>
      </CardFooter>
    </Card>
  );
}
