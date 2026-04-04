import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RegistrationHistory } from "./registration-history";

export default async function RegistrationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: registrations } = await supabase
    .from("eckcm_registrations")
    .select(`
      id,
      confirmation_code,
      status,
      registration_type,
      start_date,
      end_date,
      nights_count,
      total_amount_cents,
      created_at,
      eckcm_events!inner(name_en, name_ko)
    `)
    .eq("created_by_user_id", user.id)
    .in("status", ["SUBMITTED", "APPROVED", "PAID", "CANCELLED", "REFUNDED"])
    .order("created_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <RegistrationHistory registrations={(registrations ?? []) as any} />;
}
