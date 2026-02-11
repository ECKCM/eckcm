"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { ProfileForm, type ProfileFormData } from "@/components/auth/profile-form";
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

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [churches, setChurches] = useState<Church[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function fetchData() {
      const [churchRes, deptRes] = await Promise.all([
        supabase
          .from("ECKCM_churches")
          .select("id, name_en, is_other")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("ECKCM_departments")
          .select("id, name_en, name_ko")
          .eq("is_active", true)
          .order("sort_order"),
      ]);

      if (churchRes.data) setChurches(churchRes.data);
      if (deptRes.data) setDepartments(deptRes.data);
    }

    fetchData();
  }, []);

  const checkEmailDuplicate = async () => {
    if (!email) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("ECKCM_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (data) {
      setEmailError("This email is already registered");
    } else {
      setEmailError("");
      toast.success("Email is available");
    }
  };

  const handleSignup = async (profileData: ProfileFormData) => {
    if (email !== confirmEmail) {
      toast.error("Emails do not match");
      return;
    }
    if (emailError) {
      toast.error("Please use a different email");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError || !authData.user) {
      toast.error(authError?.message ?? "Signup failed");
      setLoading(false);
      return;
    }

    const userId = authData.user.id;

    // 2. Create ECKCM_users record
    const { error: userError } = await supabase.from("ECKCM_users").insert({
      id: userId,
      email,
      auth_provider: "email",
      profile_completed: true,
    });

    if (userError) {
      toast.error("Failed to create user profile");
      setLoading(false);
      return;
    }

    // 3. Create person record
    const birthDate = `${profileData.birthYear}-${String(profileData.birthMonth).padStart(2, "0")}-${String(profileData.birthDay).padStart(2, "0")}`;

    const { data: person, error: personError } = await supabase
      .from("ECKCM_people")
      .insert({
        last_name_en: profileData.lastName,
        first_name_en: profileData.firstName,
        display_name_ko: profileData.displayNameKo || null,
        gender: profileData.gender,
        birth_date: birthDate,
        is_k12: profileData.isK12,
        grade: profileData.grade || null,
        email,
        phone: profileData.phone,
        department_id: profileData.departmentId || null,
        church_id: profileData.churchId || null,
        church_other: profileData.churchOther || null,
      })
      .select("id")
      .single();

    if (personError || !person) {
      toast.error("Failed to create person record");
      setLoading(false);
      return;
    }

    // 4. Link user to person
    const { error: linkError } = await supabase
      .from("ECKCM_user_people")
      .insert({
        user_id: userId,
        person_id: person.id,
      });

    if (linkError) {
      toast.error("Failed to link user to person");
      setLoading(false);
      return;
    }

    toast.success("Account created successfully!");
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">ECKCM</CardTitle>
        <CardDescription>Create your account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <OAuthButtons />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              Or register with email
            </span>
          </div>
        </div>

        {/* Email & Password section */}
        <div className="space-y-3">
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
                }}
                placeholder="email@example.com"
                required
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={checkEmailDuplicate}
                className="shrink-0"
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
              required
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
              required
            />
          </div>
        </div>

        <Separator />

        {/* Profile Form */}
        <ProfileForm
          churches={churches}
          departments={departments}
          onSubmit={handleSignup}
          submitLabel="Create Account"
          loading={loading}
        />
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Sign In
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
