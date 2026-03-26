"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { TurnstileWidget } from "@/components/shared/turnstile-widget";
import { createClient } from "@/lib/supabase/client";
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
import { ProfileForm, type ProfileFormData } from "@/components/auth/profile-form";
import { checkEmailAvailability, createUserProfile } from "../actions";
import { toast } from "sonner";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";
import { sanitizeEmailInput } from "@/lib/utils/field-helpers";

interface Church {
  id: string;
  name_en: string;
  name_ko: string | null;
  is_other: boolean;
}

interface Department {
  id: string;
  name_en: string;
  name_ko: string;
}


export default function CompleteProfilePage() {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [churches, setChurches] = useState<Church[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [eventStartDate, setEventStartDate] = useState<string | undefined>();
  const [isEmailSignup, setIsEmailSignup] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Email signup fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");

  // Consent checkboxes
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);

  // Turnstile CAPTCHA
  const [captchaToken, setCaptchaToken] = useState<string>();
  const turnstileRef = useRef<TurnstileInstance>(null);

  const isValidEmail = (v: string) => !v || /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(v);

  const validateSignupFields = (): boolean => {
    if (!isEmailSignup) return true;

    let valid = true;
    setEmailError("");
    setPasswordError("");
    setConfirmPasswordError("");

    if (!email) {
      setEmailError(t("auth.emailRequired"));
      valid = false;
    } else if (!isValidEmail(email)) {
      setEmailError(t("auth.validEmail"));
      valid = false;
    }
    if (!password) {
      setPasswordError(t("auth.passwordRequired"));
      valid = false;
    } else if (password.length < 8) {
      setPasswordError(t("auth.passwordMin"));
      valid = false;
    }
    if (!confirmPassword) {
      setConfirmPasswordError(t("auth.confirmPasswordRequired"));
      valid = false;
    } else if (password !== confirmPassword) {
      setConfirmPasswordError(t("auth.passwordsNoMatch"));
      valid = false;
    }

    if (!ageConfirmed) valid = false;
    if (!termsAgreed) valid = false;

    return valid;
  };

  useEffect(() => {
    const supabase = createClient();

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUserEmail(user.email ?? "");

        // Check if profile is already completed
        const { data: profile } = await supabase
          .from("eckcm_users")
          .select("profile_completed")
          .eq("id", user.id)
          .single();

        if (profile?.profile_completed) {
          router.push("/dashboard");
          return;
        }
      } else {
        // No session - email signup flow
        setIsEmailSignup(true);
      }

      // Fetch reference data
      const [churchRes, deptRes, eventRes] = await Promise.all([
        supabase
          .from("eckcm_churches")
          .select("id, name_en, name_ko, is_other")
          .eq("is_active", true)
          .order("name_en"),
        supabase
          .from("eckcm_departments")
          .select("id, name_en, name_ko")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("eckcm_events")
          .select("event_start_date")
          .eq("is_active", true)
          .order("event_start_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (churchRes.data) setChurches(churchRes.data);
      if (deptRes.data) setDepartments(deptRes.data);
      if (eventRes.data) setEventStartDate(eventRes.data.event_start_date);
      setInitialized(true);
    }

    init();
  }, [router]);

  const handleSubmit = async (data: ProfileFormData) => {
    setLoading(true);
    const supabase = createClient();

    // Consent checks (onValidate already caught field errors, but consent needs toast)
    if (!ageConfirmed) {
      toast.error(t("auth.pleaseConfirmAge"));
      setLoading(false);
      return;
    }
    if (!termsAgreed) {
      toast.error(t("auth.pleaseAgreeTerms"));
      setLoading(false);
      return;
    }

    let signedUpUser = null;

    if (isEmailSignup) {
      // Check email availability (async — can't do in synchronous onValidate)
      const { available } = await checkEmailAvailability(email);
      if (!available) {
        setEmailError(t("auth.emailAlreadyRegistered"));
        setLoading(false);
        return;
      }

      // Create auth user
      const { data: signUpData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          captchaToken,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        const isRateLimit =
          authError.message.toLowerCase().includes("rate limit") ||
          authError.status === 429;
        toast.error(
          isRateLimit
            ? t("auth.tooManyAttempts")
            : authError.message
        );
        setCaptchaToken(undefined);
        turnstileRef.current?.reset();
        setLoading(false);
        return;
      }

      // Use user from signUp response directly — session may not exist yet if
      // email confirmation is required, so getUser() would return null
      signedUpUser = signUpData.user;
    }

    // Get authenticated user (OAuth flow reuses existing session; email signup uses signedUpUser)
    const user = signedUpUser ?? (await supabase.auth.getUser()).data.user;

    if (!user) {
      toast.error(t("auth.notAuthenticated"));
      setLoading(false);
      return;
    }

    // Determine auth provider
    const provider = user.app_metadata.provider ?? "email";
    const now = new Date().toISOString();

    // Build birth date
    const birthDate =
      data.birthYear && data.birthMonth && data.birthDay
        ? `${data.birthYear}-${String(data.birthMonth).padStart(2, "0")}-${String(data.birthDay).padStart(2, "0")}`
        : null;

    // Create profile via server action (uses admin client to bypass RLS)
    const result = await createUserProfile({
      userId: user.id,
      email: user.email!,
      authProvider: provider,
      ageConfirmedAt: ageConfirmed ? now : null,
      termsAgreedAt: termsAgreed ? now : null,
      lastName: data.lastName,
      firstName: data.firstName,
      displayNameKo: data.displayNameKo,
      gender: data.gender,
      birthDate,
      isK12: data.isK12,
      grade: data.grade,
      phone: data.phone,
      phoneCountry: data.phoneCountry || "US",
      departmentId: data.departmentId,
      churchId: data.churchId,
      churchOther: data.churchOther,
    });

    if (!result.success) {
      toast.error(result.error ?? t("auth.failedCreateProfile"));
      setLoading(false);
      return;
    }

    if (isEmailSignup) {
      // Email confirmation required — redirect to check-email page
      toast.success(t("auth.accountCreated"));
      setLoading(false);
      router.push(`/signup/check-email?email=${encodeURIComponent(email)}`);
      return;
    }

    toast.success(t("auth.profileCompleted"));
    setLoading(false);
    router.push("/dashboard");
  };

  const handleCancel = async () => {
    if (!isEmailSignup) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.push("/");
    router.refresh();
  };

  if (!initialized) return null;

  return (
    <Card className="bg-white dark:bg-card">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">
          {isEmailSignup ? t("auth.createAccountTitle") : t("auth.completeProfile")}
        </CardTitle>
        <CardDescription>
          {isEmailSignup
            ? t("auth.fillInfoCreate")
            : t("auth.fillInfoComplete")}
          {userEmail && (
            <span className="block mt-1 font-medium text-foreground">
              {userEmail}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEmailSignup && (
          <>
            <div className="space-y-1">
              <Label htmlFor="signup-email">{t("auth.email")} <span className="text-destructive">*</span></Label>
              <Input
                id="signup-email"
                name="signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(sanitizeEmailInput(e.target.value));
                  setEmailError("");
                }}
                placeholder="email@example.com"
                className={emailError || (email && !isValidEmail(email)) ? "border-destructive" : ""}
              />
              {emailError && (
                <p className="text-xs text-destructive">{emailError}</p>
              )}
              {email && !isValidEmail(email) && !emailError && (
                <p className="text-xs text-destructive">{t("auth.validEmail")}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="signup-password">{t("auth.password")} <span className="text-destructive">*</span></Label>
              <PasswordInput
                id="signup-password"
                name="signup-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError("");
                }}
                placeholder={t("auth.minChars")}
                minLength={8}
                className={passwordError || (password && password.length < 8) ? "border-destructive" : ""}
              />
              {passwordError && (
                <p className="text-xs text-destructive">{passwordError}</p>
              )}
              {!passwordError && password && password.length < 8 && (
                <p className="text-xs text-destructive">{t("auth.passwordMin")}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="signup-confirm-password">{t("auth.confirmPassword")} <span className="text-destructive">*</span></Label>
              <PasswordInput
                id="signup-confirm-password"
                name="signup-confirm-password"
                autoComplete="off"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setConfirmPasswordError("");
                }}
                placeholder={t("auth.reenterPassword")}
                className={confirmPasswordError || (confirmPassword && password !== confirmPassword) ? "border-destructive" : ""}
              />
              {confirmPasswordError && (
                <p className="text-xs text-destructive">{confirmPasswordError}</p>
              )}
              {!confirmPasswordError && confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-destructive">{t("auth.passwordsNoMatch")}</p>
              )}
            </div>
            <Separator />
          </>
        )}
        <ProfileForm
          churches={churches}
          departments={departments}
          eventStartDate={eventStartDate}
          onSubmit={handleSubmit}
          onValidate={validateSignupFields}
          submitLabel={isEmailSignup ? t("auth.createAccountBtn") : t("auth.completeProfileBtn")}
          loading={loading}
          hideDepartment
          hideBirthDate
          hideChurch
        >
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="ageConfirmed"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                className="mt-1"
              />
              <Label htmlFor="ageConfirmed" className="text-sm font-normal leading-snug">
                {t("auth.ageConfirm")} <span className="text-destructive">*</span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="termsAgreed"
                checked={termsAgreed}
                onChange={(e) => setTermsAgreed(e.target.checked)}
                className="mt-1"
              />
              <Label htmlFor="termsAgreed" className="text-sm font-normal leading-snug">
                {t("auth.termsAgree")}{" "}
                <Link href="/terms" target="_blank" className="underline text-primary hover:text-primary/80">
                  {t("auth.termsOfService")}
                </Link>{" "}
                {t("auth.and")}{" "}
                <Link href="/privacy" target="_blank" className="underline text-primary hover:text-primary/80">
                  {t("auth.privacyPolicy")}
                </Link>
                . <span className="text-destructive">*</span>
              </Label>
            </div>
            {isEmailSignup && (
              <TurnstileWidget
                ref={turnstileRef}
                onSuccess={setCaptchaToken}
                onExpire={() => setCaptchaToken(undefined)}
              />
            )}
          </div>
        </ProfileForm>
      </CardContent>
      <CardFooter className="justify-center">
        <Button variant="ghost" size="sm" onClick={handleCancel}>
          {t("common.cancel")}
        </Button>
      </CardFooter>
    </Card>
  );
}
