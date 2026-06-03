import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * PATCH /api/admin/participants/[membershipId]/title
 * Assign (or clear) the participant title on a single group membership.
 * Body: { title_id: string | null }  — null clears the title.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ membershipId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { membershipId } = await params;

  let body: { title_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!("title_id" in body)) {
    return NextResponse.json({ error: "title_id is required" }, { status: 400 });
  }

  const titleId = body.title_id ?? null;
  if (titleId !== null && typeof titleId !== "string") {
    return NextResponse.json({ error: "title_id must be a string or null" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: updated, error } = await supabase
    .from("eckcm_group_memberships")
    .update({ title_id: titleId })
    .eq("id", membershipId)
    .select("id, person_id, title_id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  }

  // Audit (mirrors the participant-removal route).
  await supabase.from("eckcm_audit_logs").insert({
    user_id: admin.user.id,
    action: "ASSIGN_PARTICIPANT_TITLE",
    entity_type: "group_membership",
    entity_id: membershipId,
    new_data: { person_id: updated.person_id, title_id: titleId },
  });

  return NextResponse.json({ success: true, title_id: updated.title_id });
}
