import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

const MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER"] as const;
type MealType = (typeof MEAL_TYPES)[number];

/**
 * PUT /api/admin/registrations/[id]/participants/[membershipId]/meals
 *
 * Replaces the participant's meal selections for this registration with the
 * provided list. Caller sends the full grid — both selected and unselected
 * meals for every relevant (date, type) — and the server stores it verbatim
 * (delete-then-insert). Storing the full grid lets admin "unchecked" state
 * survive a reload; absence of any rows then unambiguously means
 * "uninitialized → use defaults" in the UI.
 *
 * Does NOT recalculate fees — admins should record any monetary delta in
 * the Adjustments tab.
 *
 * Body: { selections: [{ meal_date, meal_type, is_selected }] }
 * `is_selected` defaults to true if omitted (backwards-compatible).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; membershipId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: registrationId, membershipId } = await params;
  const body = await request.json();

  const raw = Array.isArray(body?.selections) ? body.selections : null;
  if (raw == null) {
    return NextResponse.json({ error: "selections array required" }, { status: 400 });
  }

  const isIso = (v: unknown): v is string =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isMealType = (v: unknown): v is MealType =>
    typeof v === "string" && (MEAL_TYPES as readonly string[]).includes(v);

  type SelectionInput = { meal_date: string; meal_type: MealType; is_selected: boolean };
  const selections: SelectionInput[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") {
      return NextResponse.json({ error: "selection must be an object" }, { status: 400 });
    }
    if (!isIso(s.meal_date)) {
      return NextResponse.json({ error: `invalid meal_date: ${s.meal_date}` }, { status: 400 });
    }
    if (!isMealType(s.meal_type)) {
      return NextResponse.json({ error: `invalid meal_type: ${s.meal_type}` }, { status: 400 });
    }
    const isSelected = s.is_selected === undefined ? true : !!s.is_selected;
    selections.push({ meal_date: s.meal_date, meal_type: s.meal_type, is_selected: isSelected });
  }

  // Dedupe by (date, type) — UNIQUE constraint on the table would catch this
  // anyway but failing fast gives a clearer error.
  const seen = new Set<string>();
  for (const s of selections) {
    const k = `${s.meal_date}|${s.meal_type}`;
    if (seen.has(k)) {
      return NextResponse.json({ error: `duplicate selection: ${k}` }, { status: 400 });
    }
    seen.add(k);
  }

  const supabase = createAdminClient();

  // Resolve membership -> person_id and verify it belongs to this registration.
  const { data: membership } = await supabase
    .from("eckcm_group_memberships")
    .select(`person_id, eckcm_groups!inner(registration_id)`)
    .eq("id", membershipId)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = membership as any;
  if (!m || m.eckcm_groups?.registration_id !== registrationId) {
    return NextResponse.json({ error: "Membership not found in this registration" }, { status: 404 });
  }
  const personId: string = m.person_id;

  // Snapshot existing for audit + delete-then-insert replace.
  const { data: existing } = await supabase
    .from("eckcm_meal_selections")
    .select("id, meal_date, meal_type")
    .eq("registration_id", registrationId)
    .eq("person_id", personId);

  const { error: deleteError } = await supabase
    .from("eckcm_meal_selections")
    .delete()
    .eq("registration_id", registrationId)
    .eq("person_id", personId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (selections.length > 0) {
    const rows = selections.map((s) => ({
      registration_id: registrationId,
      person_id: personId,
      meal_date: s.meal_date,
      meal_type: s.meal_type,
      is_selected: s.is_selected,
    }));
    const { error: insertError } = await supabase
      .from("eckcm_meal_selections")
      .insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  await supabase.from("eckcm_audit_logs").insert({
    user_id: admin.user.id,
    action: "EDIT_PARTICIPANT_MEALS",
    entity_type: "membership",
    entity_id: membershipId,
    old_data: { selections: existing ?? [] },
    new_data: { registration_id: registrationId, person_id: personId, selections },
  });

  return NextResponse.json({ success: true, count: selections.length });
}
