"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default function CompleteProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [churches, setChurches] = useState<Church[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const supabase = createClient();

    async function init() {
      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

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

      // Fetch reference data
      const [churchRes, deptRes] = await Promise.all([
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
      ]);

      if (churchRes.data) setChurches(churchRes.data);
      if (deptRes.data) setDepartments(deptRes.data);
    }

    init();
  }, [router]);

  const handleSubmit = async (data: ProfileFormData) => {
    setLoading(true);
    const supabase = createClient();

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

    toast.success("Profile completed!");
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Complete Your Profile</CardTitle>
        <CardDescription>
          Please fill in your personal information to continue.
          {userEmail && (
            <span className="block mt-1 font-medium text-foreground">
              {userEmail}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ProfileForm
          churches={churches}
          departments={departments}
          onSubmit={handleSubmit}
          submitLabel="Complete Profile"
          loading={loading}
        />
      </CardContent>
    </Card>
  );
}
