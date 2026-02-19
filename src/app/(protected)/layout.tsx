import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopHeader } from "@/components/shared/top-header";
import { SiteFooter } from "@/components/shared/site-footer";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from("eckcm_users")
    .select("email, locale")
    .eq("id", user.id)
    .single();

  // Get person info for display name
  const { data: userPeople } = await supabase
    .from("eckcm_user_people")
    .select("person_id")
    .eq("user_id", user.id);

  const personIds = userPeople?.map((up) => up.person_id) ?? [];
  let person: {
    first_name_en: string;
    last_name_en: string;
    display_name_ko: string | null;
  } | null = null;

  if (personIds.length > 0) {
    const { data } = await supabase
      .from("eckcm_people")
      .select("first_name_en, last_name_en, display_name_ko")
      .eq("id", personIds[0])
      .single();
    person = data;
  }

  // Check if user is admin
  const { data: staffAssignments } = await supabase
    .from("eckcm_staff_assignments")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1);

  const isAdmin = (staffAssignments?.length ?? 0) > 0;

  const email = profile?.email ?? user.email ?? "";
  const displayName = person
    ? person.display_name_ko ??
      `${person.first_name_en} ${person.last_name_en}`
    : email;
  const initials = person
    ? `${person.first_name_en[0]}${person.last_name_en[0]}`.toUpperCase()
    : email[0]?.toUpperCase() ?? "U";

  return (
    <div className="flex min-h-screen flex-col">
      <TopHeader
        user={{ id: user.id, email }}
        displayName={displayName}
        initials={initials}
        isAdmin={isAdmin}
      />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
