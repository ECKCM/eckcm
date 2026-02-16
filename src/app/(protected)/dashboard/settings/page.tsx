import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileSettings } from "./profile-settings";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get user profile
  const { data: profile } = await supabase
    .from("eckcm_users")
    .select("email, auth_provider, locale")
    .eq("id", user.id)
    .single();

  // Get person info
  const { data: userPeople } = await supabase
    .from("eckcm_user_people")
    .select("person_id")
    .eq("user_id", user.id);

  const personIds = userPeople?.map((up) => up.person_id) ?? [];

  let person = null;
  if (personIds.length > 0) {
    const { data } = await supabase
      .from("eckcm_people")
      .select(
        "id, first_name_en, last_name_en, display_name_ko, gender, birth_date, is_k12, grade, email, phone, phone_country, department_id, church_id, church_other"
      )
      .eq("id", personIds[0])
      .single();
    person = data;
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

  return (
    <ProfileSettings
      userId={user.id}
      profile={profile}
      person={person}
      churches={churchRes.data ?? []}
      departments={deptRes.data ?? []}
      eventStartDate={eventRes.data?.event_start_date}
    />
  );
}
