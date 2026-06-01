import { createAdminClient } from "@/lib/supabase/admin";
import { DonationsTable, type DonationRow } from "./donations-table";

export const dynamic = "force-dynamic";

export default async function DonationsPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("eckcm_donations")
    .select(
      "id, donor_name, donor_email, amount_cents, fee_cents, covers_fees, payment_method, status, stripe_payment_intent_id, metadata, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(2000);

  // Hide only abandoned/failed CARD attempts — PENDING/FAILED card rows are noise
  // (donor opened the Stripe form but never completed). Paid cards stay visible
  // through their whole lifecycle including REFUNDED / PARTIALLY_REFUNDED. Manual
  // methods (Zelle/Check/Cash → ONSITE) show from PENDING so admins can confirm.
  const rows = ((data ?? []) as DonationRow[]).filter(
    (d) => d.payment_method !== "CARD" || (d.status !== "PENDING" && d.status !== "FAILED")
  );

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Donations</h1>
      </div>
      <div className="p-6">
        <DonationsTable donations={rows} />
      </div>
    </div>
  );
}
