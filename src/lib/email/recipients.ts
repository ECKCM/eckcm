import type { SupabaseClient } from "@supabase/supabase-js";

const ACTIVE_REGISTRATION_STATUSES = ["PAID", "SUBMITTED"] as const;

interface ResolveRecipientsArgs {
  /** Service-role client. */
  admin: SupabaseClient;
  /** Event whose registrations should be targeted. */
  eventId: string;
  /** Optional department filter (eckcm_people.department_id). Empty = all. */
  departmentIds?: string[];
}

/**
 * Resolve the unique set of participant email addresses for an announcement.
 *
 * Recipient base: every participant (eckcm_people.email) attached to an
 * active registration (PAID or SUBMITTED) for the given event. Optionally
 * restricted to a department selection.
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
  const { admin, eventId, departmentIds = [] } = args;

  const { data: regs, error: regsErr } = await admin
    .from("eckcm_registrations")
    .select("id")
    .eq("event_id", eventId)
    .in("status", ACTIVE_REGISTRATION_STATUSES as unknown as string[]);
  if (regsErr) throw regsErr;
  if (!regs || regs.length === 0) return [];

  const regIds = regs.map((r) => r.id as string);

  const { data: groups, error: groupsErr } = await admin
    .from("eckcm_groups")
    .select("id")
    .in("registration_id", regIds);
  if (groupsErr) throw groupsErr;
  if (!groups || groups.length === 0) return [];

  const groupIds = groups.map((g) => g.id as string);

  let query = admin
    .from("eckcm_group_memberships")
    .select("eckcm_people!inner(email, department_id)")
    .in("group_id", groupIds)
    .not("eckcm_people.email", "is", null);

  if (departmentIds.length > 0) {
    query = query.in("eckcm_people.department_id", departmentIds);
  }

  const { data: memberships, error: mErr } = await query;
  if (mErr) throw mErr;

  const seen = new Set<string>();
  for (const m of memberships ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const email = (m as any).eckcm_people?.email as string | undefined;
    if (!email) continue;
    const normalized = email.trim().toLowerCase();
    if (!normalized) continue;
    seen.add(normalized);
  }
  return Array.from(seen);
}
