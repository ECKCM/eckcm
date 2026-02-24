import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
    .from("eckcm_epass_tokens")
    .select(`
      id,
      token,
      is_active,
      created_at,
      person_id,
      registration_id,
      eckcm_people!inner(first_name_en, last_name_en, display_name_ko, gender, birth_date),
      eckcm_registrations!inner(
        confirmation_code,
        status,
        start_date,
        end_date,
        event_id,
        created_by_user_id,
        eckcm_events!inner(name_en, name_ko, location)
      )
    `)
    .eq("id", id)
    .single();

  if (!token) notFound();

  // Verify this user owns this E-Pass (via registration creator)
  const reg = (token as any).eckcm_registrations;
  if (reg?.created_by_user_id !== user.id) {
    notFound();
  }

  // Fetch participant_code from group_memberships
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = token as any;

  const { data: membership } = await admin
    .from("eckcm_group_memberships")
    .select("participant_code, eckcm_groups!inner(registration_id)")
    .eq("person_id", t.person_id)
    .eq("eckcm_groups.registration_id", t.registration_id)
    .maybeSingle();

  const participantCode =
    (membership as any)?.participant_code ?? null;

  return (
    <EPassDetail
      token={{
        id: t.id,
        token: t.token,
        is_active: t.is_active,
        created_at: t.created_at,
        person_id: t.person_id,
        registration_id: t.registration_id,
        participant_code: participantCode,
        eckcm_people: t.eckcm_people,
        eckcm_registrations: t.eckcm_registrations,
      }}
    />
  );
}
