import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkedIn } from "@/lib/supabase/chunked-in";

const ACTIVE_REGISTRATION_STATUSES = ["PAID", "SUBMITTED"] as const;

interface ResolveRecipientsArgs {
  /** Service-role client. */
  admin: SupabaseClient;
  /** Event whose registrations should be targeted. */
  eventId: string;
  /** Optional department filter (eckcm_people.department_id). Empty = all. */
  departmentIds?: string[];
  /**
   * Optional registration-group filter (eckcm_registrations.registration_group_id,
   * the classification managed under /admin/settings/groups — e.g. Hansamo,
   * General). Empty = all groups. Mutually exclusive with departmentIds at the
   * UI level, but both are honored here if supplied.
   */
  registrationGroupIds?: string[];
}

/**
 * Resolve the unique set of participant email addresses for an announcement.
 *
 * Recipient base: every participant (eckcm_people.email) attached to an
 * active registration (PAID or SUBMITTED) for the given event. Optionally
 * restricted to a department selection and/or a registration-group selection.
 *
 * We deliberately query in staged steps because PostgREST's nested
 * filtering through two relationships (memberships → groups → registrations)
 * is brittle; the staged pipeline is easier to reason about and audit.
 *
 * Emails are normalized (trim + lowercase) and deduped before return so
 * callers can rely on `emails.length` as the unique recipient count.
 */
export async function resolveParticipantEmails(
  args: ResolveRecipientsArgs
): Promise<string[]> {
  const { admin, eventId, departmentIds = [], registrationGroupIds = [] } = args;

  let regsQuery = admin
    .from("eckcm_registrations")
    .select("id")
    .eq("event_id", eventId)
    .in("status", ACTIVE_REGISTRATION_STATUSES as unknown as string[]);
  if (registrationGroupIds.length > 0) {
    // Small id list (a handful of group classifications), safe for a plain
    // `.in()` — no URL-overflow risk the way event-wide id lists carry.
    regsQuery = regsQuery.in("registration_group_id", registrationGroupIds);
  }
  const { data: regs, error: regsErr } = await regsQuery;
  if (regsErr) throw regsErr;
  if (!regs || regs.length === 0) return [];

  const regIds = regs.map((r) => r.id as string);

  // Event-wide id lists overflow PostgREST's URL once they pass a few hundred
  // entries (the active event already has 400+ registrations and far more
  // groups), so every `.in()` on these lists must be chunked or the request
  // fails outright with "fetch failed". See lib/supabase/chunked-in.ts.
  const { data: groups, error: groupsErr } = await chunkedIn<{ id: string }>(
    admin,
    "eckcm_groups",
    "id",
    "registration_id",
    regIds
  );
  if (groupsErr) throw new Error(groupsErr.message);
  if (groups.length === 0) return [];

  const groupIds = groups.map((g) => g.id);

  const deptFilter = new Set(departmentIds);
  const { data: memberships, error: mErr } = await chunkedIn<{
    eckcm_people: { email: string | null; department_id: string | null } | null;
  }>(
    admin,
    "eckcm_group_memberships",
    "eckcm_people!inner(email, department_id)",
    "group_id",
    groupIds
  );
  if (mErr) throw new Error(mErr.message);

  const seen = new Set<string>();
  for (const m of memberships) {
    const person = m.eckcm_people;
    if (!person?.email) continue;
    // chunkedIn runs a fixed select per chunk, so the nested department_id
    // filter a single `.in()` would push down is applied in memory instead.
    if (deptFilter.size > 0 && !(person.department_id && deptFilter.has(person.department_id))) {
      continue;
    }
    const normalized = person.email.trim().toLowerCase();
    if (!normalized) continue;
    seen.add(normalized);
  }
  return Array.from(seen);
}
