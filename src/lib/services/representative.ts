import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensure a registration always has exactly one REPRESENTATIVE.
 *
 * The registration list (and emails, exports, etc.) derive the "registrant
 * name" solely from the membership whose role is REPRESENTATIVE. A registration
 * with members but no representative renders as "Unknown".
 *
 * That repless state can arise whenever a representative leaves a registration
 * that still has other members — e.g. transferring the representative out, or
 * a participant being cloned into a previously-empty registration as a MEMBER.
 *
 * This promotes the earliest-created remaining membership to REPRESENTATIVE
 * when none exists. It is a no-op when the registration is empty (nothing to
 * promote) or already has a representative.
 *
 * Must be called with a service-role client (admin) since it writes to
 * eckcm_group_memberships.
 */
export async function ensureRepresentative(
  supabase: SupabaseClient,
  registrationId: string
): Promise<void> {
  const { data: groups } = await supabase
    .from("eckcm_groups")
    .select("id")
    .eq("registration_id", registrationId);

  const groupIds = (groups ?? []).map((g: { id: string }) => g.id);
  if (groupIds.length === 0) return;

  const { data: members } = await supabase
    .from("eckcm_group_memberships")
    .select("id, role, created_at")
    .in("group_id", groupIds)
    .order("created_at", { ascending: true });

  if (!members || members.length === 0) return; // empty registration
  if (members.some((m) => m.role === "REPRESENTATIVE")) return; // already has one

  // Promote the earliest-created remaining member.
  await supabase
    .from("eckcm_group_memberships")
    .update({ role: "REPRESENTATIVE" })
    .eq("id", members[0].id);
}
