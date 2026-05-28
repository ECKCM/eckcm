import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * GET /api/admin/registrations/[id]/transfers
 * Returns participant transfer records for a registration:
 *   - out: participants transferred AWAY from this registration (tracking rows
 *          kept so the original payment can be reconciled)
 *   - in:  participants cloned INTO this registration from another one
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: registrationId } = await params;
  const supabase = createAdminClient();

  const [{ data: outRows }, { data: inRows }] = await Promise.all([
    supabase
      .from("eckcm_participant_transfers")
      .select(`
        id, person_id, to_registration_id, to_group_id, to_membership_id,
        original_role, original_participant_code, new_participant_code,
        person_first_name, person_last_name, person_display_name_ko, transferred_at,
        to_reg:eckcm_registrations!to_registration_id(confirmation_code)
      `)
      .eq("from_registration_id", registrationId)
      .order("transferred_at", { ascending: false }),
    supabase
      .from("eckcm_participant_transfers")
      .select(`
        id, person_id, to_membership_id, original_participant_code, transferred_at,
        from_reg:eckcm_registrations!from_registration_id(confirmation_code)
      `)
      .eq("to_registration_id", registrationId)
      .order("transferred_at", { ascending: false }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out = (outRows ?? []).map((r: any) => ({
    id: r.id,
    person_id: r.person_id,
    first_name_en: r.person_first_name,
    last_name_en: r.person_last_name,
    display_name_ko: r.person_display_name_ko,
    original_role: r.original_role,
    original_participant_code: r.original_participant_code,
    new_participant_code: r.new_participant_code,
    to_registration_id: r.to_registration_id,
    to_confirmation_code: r.to_reg?.confirmation_code ?? null,
    transferred_at: r.transferred_at,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const incoming = (inRows ?? []).map((r: any) => ({
    id: r.id,
    person_id: r.person_id,
    to_membership_id: r.to_membership_id,
    original_participant_code: r.original_participant_code,
    from_confirmation_code: r.from_reg?.confirmation_code ?? null,
    transferred_at: r.transferred_at,
  }));

  return NextResponse.json({ out, in: incoming });
}
