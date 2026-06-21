"use client";

import { useState, useRef } from "react";
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function UpjStaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string>();
  const turnstileRef = useRef<TurnstileInstance>(null);

  const handleLogin = async (e: React.FormEvent) => {
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

    logAuthEvent("USER_LOGIN", { method: "email", surface: "upj-staff" });
    // Middleware enforces UPJ_STAFF on /upj-staff. Non-UPJ users get bounced
    // to /dashboard (regular participants) or /admin (full admins) from there.
    router.push("/upj-staff");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">UPJ Staff</CardTitle>
            <CardDescription>Sign in with your UPJ Staff account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleLogin} className="space-y-3" suppressHydrationWarning>
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
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
                  // Chrome's built-in password manager injects __gcruniqueid
                  // onto credential inputs before React hydrates. The
                  // form-level suppress doesn't cascade to its children,
                  // so the warning has to live on the input itself.
                  suppressHydrationWarning
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setLoginError("");
                  }}
                  placeholder="••••••••"
                  required
                  suppressHydrationWarning
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
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
