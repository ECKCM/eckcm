import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EPassList } from "./epass-list";

export default async function EPassPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get E-Pass tokens for registrations created by this user
  // Note: We query through registration.created_by_user_id rather than eckcm_user_people
  // because registration creates separate person records not linked via eckcm_user_people
  const { data: tokens } = await supabase
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
        eckcm_events!inner(name_en, name_ko)
      )
    `)
    .eq("eckcm_registrations.created_by_user_id", user.id)
    .order("created_at", { ascending: false });

  if (!tokens || tokens.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-4 pt-8">
        <h1 className="text-2xl font-bold mb-4">E-Pass</h1>
        <p className="text-muted-foreground">No E-Pass found.</p>
      </div>
    );
  }

  // Fetch participant_codes from group_memberships
  const admin = createAdminClient();
  const personRegPairs = (tokens as any[]).map((t: any) => ({
    person_id: t.person_id,
    registration_id: t.registration_id,
  }));
  const personIds = [...new Set(personRegPairs.map((p) => p.person_id))];
  const registrationIds = [...new Set(personRegPairs.map((p) => p.registration_id))];

  const { data: memberships } = await admin
    .from("eckcm_group_memberships")
    .select("person_id, participant_code, eckcm_groups!inner(registration_id)")
    .in("person_id", personIds)
    .in("eckcm_groups.registration_id", registrationIds);

  // Build lookup: person_id:registration_id -> participant_code
  const codeMap = new Map<string, string>();
  for (const m of (memberships ?? []) as any[]) {
    const regId = m.eckcm_groups?.registration_id;
    if (regId) codeMap.set(`${m.person_id}:${regId}`, m.participant_code);
  }

  // Merge participant_code into tokens
  const enriched = (tokens as any[]).map((t: any) => ({
    ...t,
    participant_code: codeMap.get(`${t.person_id}:${t.registration_id}`) ?? null,
  }));

  return <EPassList tokens={enriched as any} />;
}
