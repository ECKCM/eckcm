import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signParticipantCode } from "@/lib/services/epass.service";
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
      eckcm_people!inner(first_name_en, last_name_en, display_name_ko, gender, birth_date, phone),
      eckcm_registrations!inner(
        confirmation_code,
        status,
        start_date,
        end_date,
        event_id,
        created_by_user_id,
        eckcm_events!inner(name_en, name_ko, year)
      )
    `)
    .eq("eckcm_registrations.created_by_user_id", user.id)
    .order("created_at", { ascending: false });

  if (!tokens || tokens.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 w-9 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          </Link>
          <h1 className="text-2xl font-bold">E-Pass</h1>
        </div>
        <p className="text-muted-foreground">No E-Pass found.</p>
      </div>
    );
  }

  // Get the logged-in user's own person IDs for "not your pass" detection
  // Registration creates separate person records not linked via eckcm_user_people,
  // so we match by name + birth_date to find the user's own tokens
  const { data: userPeople } = await supabase
    .from("eckcm_user_people")
    .select("person_id, eckcm_people(first_name_en, last_name_en, birth_date)")
    .eq("user_id", user.id);
  const myIdentities = (userPeople ?? []).map((up: any) => ({
    first_name_en: up.eckcm_people?.first_name_en,
    last_name_en: up.eckcm_people?.last_name_en,
    birth_date: up.eckcm_people?.birth_date,
  }));
  const myPersonIds = (tokens as any[])
    .filter((t: any) =>
      myIdentities.some(
        (me) =>
          me.first_name_en === t.eckcm_people.first_name_en &&
          me.last_name_en === t.eckcm_people.last_name_en &&
          me.birth_date === t.eckcm_people.birth_date
      )
    )
    .map((t: any) => t.person_id);

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

  // Fetch HMAC secret for signing
  const { data: config } = await admin
    .from("eckcm_app_config")
    .select("epass_hmac_secret")
    .eq("id", 1)
    .single();
  const hmacSecret = (config as any)?.epass_hmac_secret as string | null;

  // Merge participant_code and qr_value into tokens
  const enriched = (tokens as any[]).map((t: any) => {
    const code = codeMap.get(`${t.person_id}:${t.registration_id}`) ?? null;
    return {
      ...t,
      participant_code: code,
      qr_value: code && hmacSecret ? signParticipantCode(code, hmacSecret) : code,
    };
  });

  return <EPassList tokens={enriched as any} myPersonIds={myPersonIds} />;
}
