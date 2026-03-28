import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReceiptList } from "./receipt-list";

export default async function ReceiptsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Get invoices for user's registrations (use admin to bypass RLS on nested joins)
  const { data: registrations } = await admin
    .from("eckcm_registrations")
    .select("id")
    .eq("created_by_user_id", user.id);

  const regIds = registrations?.map((r) => r.id) ?? [];

  if (regIds.length === 0) {
    return (
      <ReceiptList invoices={[]} />
    );
  }

  const [{ data: invoices }, { data: groupMemberships }] = await Promise.all([
    admin
      .from("eckcm_invoices")
      .select(`
        id,
        invoice_number,
        total_cents,
        status,
        issued_at,
        paid_at,
        registration_id,
        eckcm_invoice_line_items(description_en, quantity, unit_price_cents, total_cents),
        eckcm_payments(payment_method, status),
        eckcm_registrations!inner(
          confirmation_code,
          registration_type,
          eckcm_events!inner(name_en)
        )
      `)
      .in("registration_id", regIds)
      .order("issued_at", { ascending: false }),
    admin
      .from("eckcm_group_memberships")
      .select("eckcm_people!inner(first_name_en, last_name_en, display_name_ko), eckcm_groups!inner(registration_id)")
      .in("eckcm_groups.registration_id", regIds),
  ]);

  // Build registration_id → participant names map
  const participantsByRegId: Record<string, string[]> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (groupMemberships ?? []) as any[]) {
    const regId = m.eckcm_groups?.registration_id;
    if (!regId) continue;
    const p = m.eckcm_people;
    const fullName = `${p.first_name_en} ${p.last_name_en}`;
    const name = p.display_name_ko ? `${fullName} (${p.display_name_ko})` : fullName;
    if (!participantsByRegId[regId]) participantsByRegId[regId] = [];
    participantsByRegId[regId].push(name);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <ReceiptList invoices={(invoices ?? []) as any} participantsByRegId={participantsByRegId} />;
}
