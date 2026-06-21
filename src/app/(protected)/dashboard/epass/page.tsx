import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signParticipantCode } from "@/lib/services/epass.service";
import {
  pickBestMembership,
  resolveParticipantCode,
  type MembershipCodeRow,
} from "@/lib/services/participant-code.service";
import {
  getEPassVisibility,
  visibilityRegistrationIds,
  isTokenVisible,
} from "@/lib/services/epass-visibility.service";
import { EPassList } from "./epass-list";

export default async function EPassPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();

  // What this user may see: every pass in registrations they created, PLUS the
  // specific people their registrations transferred to/from (followed to the
  // other registration). We follow the PERSON, not the whole counterpart
  // registration, so unrelated people in that registration are NOT pulled in.
  const visibility = await getEPassVisibility(admin, user.id);
  const fetchRegIds = visibilityRegistrationIds(visibility);

  // Get E-Pass tokens for those registrations.
  //
  // Use the ADMIN client, not the user-scoped one: the RLS policy "Users read
  // own epass" only exposes tokens whose registration.created_by_user_id =
  // auth.uid(), which would re-hide exactly the transferred-in passes we want.
  // Access is enforced in the app by `visibility` (own registrations + the
  // specific transferred (person, registration) pairs), which is strictly more
  // precise than the created_by RLS rule. Consistent with the membership/code/
  // config reads below, which already use admin.
  //
  // We query by registration_id (not eckcm_user_people) because registration
  // creates separate person records not linked via eckcm_user_people.
  const { data: fetchedTokens } = fetchRegIds.length
    ? await admin
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
        registration_type,
        eckcm_events!inner(name_en, name_ko, year)
      )
    `)
        .in("registration_id", fetchRegIds)
        .order("created_at", { ascending: false })
    : { data: null };

  // Trim strangers: a transfer-target registration may contain other people the
  // user has nothing to do with. Keep only tokens whose (person, registration)
  // is actually visible — own registration, or the exact transferred pair.
  const tokens = (fetchedTokens ?? []).filter((t: any) =>
    isTokenVisible(visibility, t.person_id, t.registration_id),
  );

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
    .filter((t: any) => {
      // Primary: check against eckcm_user_people identities
      if (myIdentities.length > 0) {
        return myIdentities.some((me) => {
          if (me.first_name_en !== t.eckcm_people.first_name_en) return false;
          if (me.last_name_en !== t.eckcm_people.last_name_en) return false;
          // Only require birth_date match if both records have it
          if (me.birth_date && t.eckcm_people.birth_date) {
            return me.birth_date === t.eckcm_people.birth_date;
          }
          return true;
        });
      }
      // Fallback: match by auth user metadata full_name (handles accounts without eckcm_user_people)
      const fullName = (user.user_metadata?.full_name as string | undefined)?.toLowerCase().trim();
      if (fullName) {
        const personName = `${t.eckcm_people.first_name_en} ${t.eckcm_people.last_name_en}`.toLowerCase().trim();
        return personName === fullName;
      }
      return false;
    })
    .map((t: any) => t.person_id);

  // Fetch participant_codes from group_memberships (admin client created above).
  const personRegPairs = (tokens as any[]).map((t: any) => ({
    person_id: t.person_id,
    registration_id: t.registration_id,
  }));
  const personIds = [...new Set(personRegPairs.map((p) => p.person_id))];
  const registrationIds = [...new Set(personRegPairs.map((p) => p.registration_id))];

  const { data: memberships } = await admin
    .from("eckcm_group_memberships")
    .select(
      "id, person_id, participant_code, status, created_at, eckcm_groups!inner(registration_id)"
    )
    .in("person_id", personIds)
    .in("eckcm_groups.registration_id", registrationIds);

  // Build lookup: person_id:registration_id -> participant_code.
  // A person can have duplicate membership rows or rows with NULL codes, so
  // collect every row per key and rank, instead of letting the last row win
  // (which could clobber a valid code with NULL and hide the QR).
  const rowsByKey = new Map<string, MembershipCodeRow[]>();
  for (const m of (memberships ?? []) as any[]) {
    const regId = m.eckcm_groups?.registration_id;
    if (!regId) continue;
    const key = `${m.person_id}:${regId}`;
    const list = rowsByKey.get(key) ?? [];
    list.push(m);
    rowsByKey.set(key, list);
  }
  const codeMap = new Map<string, string>();
  for (const [key, rows] of rowsByKey) {
    const code = pickBestMembership(rows)?.participant_code;
    if (code) codeMap.set(key, code);
  }

  // Fetch HMAC secret for signing
  const { data: config } = await admin
    .from("eckcm_app_config")
    .select("epass_hmac_secret")
    .eq("id", 1)
    .single();
  const hmacSecret = (config as any)?.epass_hmac_secret as string | null;

  // A membership row is the single source of truth for "this person belongs to
  // this registration". When a participant is transferred out (clone model),
  // their original membership is removed but a stale e-pass token can linger —
  // sometimes even with is_active=true if the transfer's deactivation step
  // didn't run. Such ghost tokens have NO membership, so they must not appear
  // here (they show a broken "QR unavailable" pass for someone who already
  // moved to another registration). We therefore keep a token only when a
  // membership exists for its (person, registration) pair.
  //
  // We rank rows by membership presence, NOT by token is_active, because 100+
  // legitimate participants have is_active=false tokens (SUBMITTED pending
  // payment, or REFUNDED) — filtering on is_active alone would wrongly hide
  // them. Visibility/up-to-date status is driven by the registration status and
  // membership, consistent with the "exclude cancelled/refunded" rule.
  const hasMembership = (t: any) =>
    rowsByKey.has(`${t.person_id}:${t.registration_id}`);

  const visibleTokens = (tokens as any[]).filter((t: any) => {
    // Drop ghost tokens: token without any membership in the registration
    // (transferred-away or otherwise orphaned).
    if (!hasMembership(t)) return false;
    // Drop refunded/cancelled registrations — never a valid e-pass to display.
    const status = t.eckcm_registrations?.status;
    if (status === "REFUNDED" || status === "CANCELLED") return false;
    return true;
  });

  if (visibleTokens.length === 0) {
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

  // Merge participant_code and qr_value into tokens. Every visible token has a
  // membership, so its code resolves from the batch query; self-heal covers the
  // rare NULL-code membership so the QR still renders.
  const ownRegSet = new Set(visibility.ownRegistrationIds);
  const enriched = await Promise.all(
    visibleTokens.map(async (t: any) => {
      let code = codeMap.get(`${t.person_id}:${t.registration_id}`) ?? null;
      if (!code) {
        code = await resolveParticipantCode(admin, t.person_id, t.registration_id);
      }
      return {
        ...t,
        participant_code: code,
        qr_value: code && hmacSecret ? signParticipantCode(code, hmacSecret) : code,
        // Tab routing: "My registration" holds the people in the user's own SELF
        // registration(s). People the user registered under an "others"-type
        // registration, or people followed in via a transfer, go under "others".
        // (The user's OWN pass is added to "My" separately in EPassList, since it
        // may sit in an others-type registration after a self-transfer.)
        is_my_self_registration:
          ownRegSet.has(t.registration_id) &&
          t.eckcm_registrations?.registration_type === "self",
      };
    })
  );

  return <EPassList tokens={enriched as any} myPersonIds={myPersonIds} />;
}
