import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReceiptList } from "./receipt-list";

export default async function ReceiptsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get invoices for user's registrations
  const { data: registrations } = await supabase
    .from("eckcm_registrations")
    .select("id")
    .eq("created_by_user_id", user.id);

  const regIds = registrations?.map((r) => r.id) ?? [];

  if (regIds.length === 0) {
    return (
      <ReceiptList invoices={[]} />
    );
  }

  const { data: invoices } = await supabase
    .from("eckcm_invoices")
    .select(`
      id,
      invoice_number,
      total_cents,
      status,
      issued_at,
      paid_at,
      registration_id,
      eckcm_registrations!inner(
        confirmation_code,
        eckcm_events!inner(name_en)
      )
    `)
    .in("registration_id", regIds)
    .order("issued_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <ReceiptList invoices={(invoices ?? []) as any} />;
}
