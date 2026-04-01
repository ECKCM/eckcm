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
    .from("eckcm_users")
    .select("profile_completed, email, locale")
    .eq("id", user.id)
    .single();

  if (!profile?.profile_completed) {
    redirect("/signup/complete-profile");
  }

  // Get person info
  const { data: personData } = await supabase
    .from("eckcm_people")
    .select("id, first_name_en, last_name_en, display_name_ko, gender, email")
    .in(
      "id",
      (
        await supabase
          .from("eckcm_user_people")
          .select("person_id")
          .eq("user_id", user.id)
      ).data?.map((up) => up.person_id) ?? []
    )
    .limit(1)
    .maybeSingle();

  // Get active events
  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, name_ko, event_start_date, event_end_date, is_active")
    .eq("is_active", true)
    .order("event_start_date", { ascending: false });

  // Check if user is admin
  const { data: staffAssignments } = await supabase
    .from("eckcm_staff_assignments")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1);

  const isAdmin = (staffAssignments?.length ?? 0) > 0;

  // Check existing registrations per active event
  const activeEventIds = (events ?? []).map((e) => e.id);
  const { data: existingRegs } = activeEventIds.length > 0
    ? await supabase
        .from("eckcm_registrations")
        .select("event_id")
        .eq("created_by_user_id", user.id)
        .in("event_id", activeEventIds)
        .in("status", ["SUBMITTED", "APPROVED", "PAID"])
        .neq("registration_type", "others")
    : { data: [] };

  const registeredEventIds = new Set(
    (existingRegs ?? []).map((r) => r.event_id)
  );

  // Fetch allow_duplicate_registration config
  const { data: appConfig } = await supabase
    .from("eckcm_app_config")
    .select("allow_duplicate_registration, booklet_url")
    .eq("id", 1)
    .single();

  const allowDuplicateRegistration = appConfig?.allow_duplicate_registration ?? false;
  const bookletUrl = appConfig?.booklet_url ?? "";

  return (
    <DashboardContent
      user={{
        id: user.id,
        email: profile.email,
      }}
      person={personData}
      events={events ?? []}
      isAdmin={isAdmin}
      registeredEventIds={Array.from(registeredEventIds)}
      allowDuplicateRegistration={allowDuplicateRegistration}
      bookletUrl={bookletUrl}
    />
  );
}
