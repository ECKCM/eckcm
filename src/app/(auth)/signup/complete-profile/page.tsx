"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
import { Separator } from "@/components/ui/separator";
import { ProfileForm, type ProfileFormData } from "@/components/auth/profile-form";
import { checkEmailAvailability } from "../actions";
import { toast } from "sonner";

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
  const [emailError, setEmailError] = useState("");
  const [emailChecked, setEmailChecked] = useState(false);

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

  const checkEmailDuplicate = async () => {
    if (!email) return;
    const { available } = await checkEmailAvailability(email);

    if (!available) {
      setEmailError("This email is already registered");
      setEmailChecked(false);
    } else {
      setEmailError("");
      setEmailChecked(true);
      toast.success("Email is available");
    }
  };

  const handleSubmit = async (data: ProfileFormData) => {
    setLoading(true);
    const supabase = createClient();

    if (isEmailSignup) {
      // Validate email/password
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
      if (emailError) {
        toast.error("Please use a different email");
        setLoading(false);
        return;
      }
      if (password.length < 8) {
        toast.error("Password must be at least 8 characters");
        setLoading(false);
        return;
      }

      // Create auth user
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        toast.error(authError.message);
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

    // 1. Upsert eckcm_users
    const { error: userError } = await supabase.from("eckcm_users").upsert({
      id: user.id,
      email: user.email!,
      auth_provider: provider,
      profile_completed: true,
    });

    if (userError) {
      toast.error("Failed to update user");
      setLoading(false);
      return;
    }

    // 2. Create person
    const birthDate = `${data.birthYear}-${String(data.birthMonth).padStart(2, "0")}-${String(data.birthDay).padStart(2, "0")}`;

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
              <Label htmlFor="email">Email *</Label>
              <div className="flex gap-2">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError("");
                    setEmailChecked(false);
                  }}
                  placeholder="email@example.com"
                />
                <Button
                  type="button"
                  variant={emailChecked ? "default" : "outline"}
                  size="sm"
                  onClick={checkEmailDuplicate}
                  className={`shrink-0 ${emailChecked ? "bg-green-600 text-white border-green-600 hover:bg-green-700" : ""}`}
                >
                  Check
                </Button>
              </div>
              {emailError && (
                <p className="text-xs text-destructive">{emailError}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmEmail">Confirm Email *</Label>
              <Input
                id="confirmEmail"
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder="email@example.com"
              />
              {confirmEmail && email !== confirmEmail && (
                <p className="text-xs text-destructive">Emails do not match</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                minLength={8}
              />
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
        />
      </CardContent>
      <CardFooter className="justify-center">
        <Button variant="ghost" size="sm" onClick={handleCancel}>
          Cancel
        </Button>
      </CardFooter>
    </Card>
  );
}
