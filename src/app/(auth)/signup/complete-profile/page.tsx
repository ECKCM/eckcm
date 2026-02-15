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
import { checkEmailAvailability } from "../actions";
import { toast } from "sonner";
import Link from "next/link";

interface Church {
  id: string;
  name_en: string;
  is_other: boolean;
}

interface Department {
  id: string;
  name_en: string;
  name_ko: string;
}

const hasNumber = (v: string) => /\d/.test(v);
const hasSymbol = (v: string) => /[^A-Za-z0-9]/.test(v);

export default function CompleteProfilePage() {
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
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailError, setEmailError] = useState("");

  // Consent checkboxes
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);

  // Turnstile CAPTCHA
  const [captchaToken, setCaptchaToken] = useState<string>();
  const turnstileRef = useRef<TurnstileInstance>(null);

  const isValidEmail = (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

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
          .select("id, name_en, is_other")
          .eq("is_active", true)
          .order("sort_order"),
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

    if (isEmailSignup) {
      // Validate consent checkboxes
      if (!ageConfirmed) {
        toast.error("Please confirm that you are at least 13 years old");
        setLoading(false);
        return;
      }
      if (!termsAgreed) {
        toast.error("Please agree to the Terms of Service and Privacy Policy");
        setLoading(false);
        return;
      }

      // Validate email
      if (!email) {
        toast.error("Email is required");
        setLoading(false);
        return;
      }
      if (email !== confirmEmail) {
        toast.error("Emails do not match");
        setLoading(false);
        return;
      }

      // Check email availability on submit
      const { available } = await checkEmailAvailability(email);
      if (!available) {
        setEmailError("This email is already registered");
        toast.error("Unable to use this email");
        setLoading(false);
        return;
      }

      // Validate password
      if (password.length < 10) {
        toast.error("Password must be at least 10 characters");
        setLoading(false);
        return;
      }
      if (!hasNumber(password) || !hasSymbol(password)) {
        toast.error("Password must include a number and a symbol");
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        toast.error("Passwords do not match");
        setLoading(false);
        return;
      }

      // Create auth user
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { captchaToken },
      });

      if (authError) {
        toast.error(authError.message);
        setCaptchaToken(undefined);
        turnstileRef.current?.reset();
        setLoading(false);
        return;
      }
    }

    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Not authenticated");
      setLoading(false);
      return;
    }

    // Determine auth provider
    const provider = user.app_metadata.provider ?? "email";
    const now = new Date().toISOString();

    // 1. Upsert eckcm_users
    const { error: userError } = await supabase.from("eckcm_users").upsert({
      id: user.id,
      email: user.email!,
      auth_provider: provider,
      profile_completed: true,
      age_confirmed_at: ageConfirmed ? now : null,
      terms_agreed_at: termsAgreed ? now : null,
    });

    if (userError) {
      toast.error("Failed to update user");
      setLoading(false);
      return;
    }

    // 2. Create person (birth_date is null for signup since hideBirthDate is true)
    const birthDate =
      data.birthYear && data.birthMonth && data.birthDay
        ? `${data.birthYear}-${String(data.birthMonth).padStart(2, "0")}-${String(data.birthDay).padStart(2, "0")}`
        : null;

    const { data: person, error: personError } = await supabase
      .from("eckcm_people")
      .insert({
        last_name_en: data.lastName,
        first_name_en: data.firstName,
        display_name_ko: data.displayNameKo || null,
        gender: data.gender,
        birth_date: birthDate,
        is_k12: data.isK12,
        grade: data.grade || null,
        email: user.email,
        phone: data.phone,
        phone_country: data.phoneCountry || "US",
        department_id: data.departmentId || null,
        church_id: data.churchId || null,
        church_other: data.churchOther || null,
      })
      .select("id")
      .single();

    if (personError || !person) {
      toast.error("Failed to create profile");
      setLoading(false);
      return;
    }

    // 3. Link user to person
    const { error: linkError } = await supabase
      .from("eckcm_user_people")
      .insert({
        user_id: user.id,
        person_id: person.id,
      });

    if (linkError) {
      toast.error("Failed to link profile");
      setLoading(false);
      return;
    }

    toast.success(isEmailSignup ? "Account created!" : "Profile completed!");
    router.push("/dashboard");
    router.refresh();
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
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">
          {isEmailSignup ? "Create Your Account" : "Complete Your Profile"}
        </CardTitle>
        <CardDescription>
          {isEmailSignup
            ? "Fill in your information to create an account."
            : "Please fill in your personal information to continue."}
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
              <Label htmlFor="signup-email">Email <span className="text-destructive">*</span></Label>
              <Input
                id="signup-email"
                name="signup-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError("");
                }}
                placeholder="email@example.com"
              />
              {emailError && (
                <p className="text-xs text-destructive">{emailError}</p>
              )}
              {email && !isValidEmail(email) && !emailError && (
                <p className="text-xs text-destructive">Enter a valid email address</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="signup-confirm-email">Confirm Email <span className="text-destructive">*</span></Label>
              <Input
                id="signup-confirm-email"
                name="signup-confirm-email"
                type="email"
                autoComplete="off"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder="email@example.com"
              />
              {confirmEmail && email !== confirmEmail && (
                <p className="text-xs text-destructive">Emails do not match</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="signup-password">Password <span className="text-destructive">*</span></Label>
              <PasswordInput
                id="signup-password"
                name="signup-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 10 characters"
                minLength={10}
              />
              {password && password.length < 10 && (
                <p className="text-xs text-destructive">Password must be at least 10 characters</p>
              )}
              {password && password.length >= 10 && (!hasNumber(password) || !hasSymbol(password)) && (
                <p className="text-xs text-destructive">Must include a number and a symbol</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="signup-confirm-password">Confirm Password <span className="text-destructive">*</span></Label>
              <PasswordInput
                id="signup-confirm-password"
                name="signup-confirm-password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
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
          submitLabel={isEmailSignup ? "Create Account" : "Complete Profile"}
          loading={loading}
          hideDepartment
          hideBirthDate={isEmailSignup}
        >
          {isEmailSignup && (
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
                  I confirm that I am at least 13 years old. <span className="text-destructive">*</span>
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
                  I agree to the{" "}
                  <Link href="/terms" target="_blank" className="underline text-primary hover:text-primary/80">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" target="_blank" className="underline text-primary hover:text-primary/80">
                    Privacy Policy
                  </Link>
                  . <span className="text-destructive">*</span>
                </Label>
              </div>
              <TurnstileWidget
                ref={turnstileRef}
                onSuccess={setCaptchaToken}
                onExpire={() => setCaptchaToken(undefined)}
              />
            </div>
          )}
        </ProfileForm>
      </CardContent>
      <CardFooter className="justify-center">
        <Button variant="ghost" size="sm" onClick={handleCancel}>
          Cancel
        </Button>
      </CardFooter>
    </Card>
  );
}
