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
      .select("id, first_name_en, last_name_en, display_name_ko, gender, birth_date, email, phone")
      .eq("id", personIds[0])
      .single();
    person = data;
  }

  return (
    <ProfileSettings
      userId={user.id}
      profile={profile}
      person={person}
    />
  );
}
