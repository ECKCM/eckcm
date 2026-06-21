import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RegistrationProvider } from "@/lib/context/registration-context";
import { RegistrationGuard } from "@/components/registration/registration-guard";
import { ForceLightMode } from "@/components/registration/force-light-mode";
import { RegistrationDateGate } from "@/components/registration/registration-date-gate";
import { AdminOnlyRegistrationGate } from "@/components/registration/admin-only-registration-gate";
import { requireAdmin } from "@/lib/auth/admin";

export default async function RegisterLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("eckcm_events")
    .select(
      "id, name_en, is_active, admin_only_registration, registration_start_date, registration_end_date"
    )
    .eq("id", eventId)
    .eq("is_active", true)
    .single();

  if (!event) {
    notFound();
  }

  const isAdmin = event.admin_only_registration
    ? (await requireAdmin()) !== null
    : true;

  return (
    <RegistrationProvider eventId={eventId}>
      <ForceLightMode />
      <AdminOnlyRegistrationGate
        adminOnly={event.admin_only_registration}
        isAdmin={isAdmin}
        eventName={event.name_en}
      >
        <RegistrationDateGate
          registrationStartDate={event.registration_start_date}
          registrationEndDate={event.registration_end_date}
          eventName={event.name_en}
        >
          <RegistrationGuard eventId={eventId}>
            {children}
          </RegistrationGuard>
        </RegistrationDateGate>
      </AdminOnlyRegistrationGate>
    </RegistrationProvider>
  );
}
