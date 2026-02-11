import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EPassDetail } from "./epass-detail";

export default async function EPassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get E-Pass token with person and registration info
  const { data: token } = await supabase
    .from("ECKCM_epass_tokens")
    .select(`
      id,
      token,
      is_active,
      created_at,
      person_id,
      registration_id,
      ECKCM_people!inner(first_name_en, last_name_en, display_name_ko, gender, birth_date),
      ECKCM_registrations!inner(
        confirmation_code,
        status,
        start_date,
        end_date,
        event_id,
        ECKCM_events!inner(name_en, name_ko, location)
      )
    `)
    .eq("id", id)
    .single();

  if (!token) notFound();

  // Verify this user owns this E-Pass
  const { data: userPeople } = await supabase
    .from("ECKCM_user_people")
    .select("person_id")
    .eq("user_id", user.id);

  const personIds = userPeople?.map((up) => up.person_id) ?? [];
  if (!personIds.includes(token.person_id)) {
    notFound();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = token as any;

  return (
    <EPassDetail
      token={{
        id: t.id,
        token: t.token,
        is_active: t.is_active,
        created_at: t.created_at,
        person_id: t.person_id,
        registration_id: t.registration_id,
        ECKCM_people: t.ECKCM_people,
        ECKCM_registrations: t.ECKCM_registrations,
      }}
    />
  );
}
