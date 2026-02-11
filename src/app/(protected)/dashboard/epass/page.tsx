import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EPassList } from "./epass-list";

export default async function EPassPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get user's person IDs
  const { data: userPeople } = await supabase
    .from("ECKCM_user_people")
    .select("person_id")
    .eq("user_id", user.id);

  const personIds = userPeople?.map((up) => up.person_id) ?? [];

  if (personIds.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-4 pt-8">
        <h1 className="text-2xl font-bold mb-4">E-Pass</h1>
        <p className="text-muted-foreground">No E-Pass found.</p>
      </div>
    );
  }

  // Get E-Pass tokens for this user's person records
  const { data: tokens } = await supabase
    .from("ECKCM_epass_tokens")
    .select(`
      id,
      token,
      is_active,
      created_at,
      person_id,
      registration_id,
      ECKCM_people!inner(first_name_en, last_name_en, display_name_ko),
      ECKCM_registrations!inner(
        confirmation_code,
        status,
        start_date,
        end_date,
        event_id,
        ECKCM_events!inner(name_en, name_ko)
      )
    `)
    .in("person_id", personIds)
    .order("created_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <EPassList tokens={(tokens ?? []) as any} />;
}
