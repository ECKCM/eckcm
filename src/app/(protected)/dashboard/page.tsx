import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardContent } from "./dashboard-content";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check profile completion
  const { data: profile } = await supabase
    .from("ECKCM_users")
    .select("profile_completed, email, locale")
    .eq("id", user.id)
    .single();

  if (!profile?.profile_completed) {
    redirect("/signup/complete-profile");
  }

  // Get person info
  const { data: personData } = await supabase
    .from("ECKCM_people")
    .select("id, first_name_en, last_name_en, display_name_ko, gender, email")
    .in(
      "id",
      (
        await supabase
          .from("ECKCM_user_people")
          .select("person_id")
          .eq("user_id", user.id)
      ).data?.map((up) => up.person_id) ?? []
    )
    .limit(1)
    .maybeSingle();

  // Get active events
  const { data: events } = await supabase
    .from("ECKCM_events")
    .select("id, name_en, name_ko, event_start_date, event_end_date, is_active")
    .eq("is_active", true)
    .order("event_start_date", { ascending: false });

  return (
    <DashboardContent
      user={{
        id: user.id,
        email: profile.email,
      }}
      person={personData}
      events={events ?? []}
    />
  );
}
