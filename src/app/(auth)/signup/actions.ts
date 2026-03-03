"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function checkEmailAvailability(
  email: string
): Promise<{ available: boolean }> {
  if (!email || !email.includes("@")) {
    return { available: false };
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("check_email_exists", {
    check_email: email,
  });

  return { available: !data };
}

export interface CreateUserProfileInput {
  userId: string;
  email: string;
  authProvider: string;
  ageConfirmedAt: string | null;
  termsAgreedAt: string | null;
  // Person fields
  lastName: string;
  firstName: string;
  displayNameKo?: string;
  gender: string;
  birthDate: string | null;
  isK12: boolean;
  grade?: string | null;
  phone: string;
  phoneCountry: string;
  departmentId?: string | null;
  churchId?: string | null;
  churchOther?: string | null;
}

export async function createUserProfile(
  input: CreateUserProfileInput
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();

  // 1. Upsert eckcm_users
  const { error: userError } = await admin.from("eckcm_users").upsert({
    id: input.userId,
    email: input.email,
    auth_provider: input.authProvider,
    profile_completed: true,
    age_confirmed_at: input.ageConfirmedAt,
    terms_agreed_at: input.termsAgreedAt,
  });

  if (userError) {
    return { success: false, error: "Failed to update user" };
  }

  // 2. Create person
  const { data: person, error: personError } = await admin
    .from("eckcm_people")
    .insert({
      last_name_en: input.lastName,
      first_name_en: input.firstName,
      display_name_ko: input.displayNameKo || null,
      gender: input.gender,
      birth_date: input.birthDate,
      is_k12: input.isK12,
      grade: input.grade || null,
      email: input.email,
      phone: input.phone,
      phone_country: input.phoneCountry || "US",
      department_id: input.departmentId || null,
      church_id: input.churchId || null,
      church_other: input.churchOther || null,
    })
    .select("id")
    .single();

  if (personError || !person) {
    return { success: false, error: "Failed to create profile" };
  }

  // 3. Link user to person
  const { error: linkError } = await admin.from("eckcm_user_people").insert({
    user_id: input.userId,
    person_id: person.id,
  });

  if (linkError) {
    return { success: false, error: "Failed to link profile" };
  }

  // 4. Sync display name + phone to auth.users metadata (visible in Supabase dashboard)
  await admin.auth.admin.updateUserById(input.userId, {
    phone: input.phone || undefined,
    user_metadata: {
      full_name: `${input.firstName} ${input.lastName}`.trim(),
    },
  });

  return { success: true };
}
