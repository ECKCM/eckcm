import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RegistrationProvider } from "@/lib/context/registration-context";
import { ForceLightMode } from "@/components/registration/force-light-mode";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

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
    .select("id, name_en, is_active")
    .eq("id", eventId)
    .eq("is_active", true)
    .single();

  if (!event) {
    notFound();
  }

  return (
    <RegistrationProvider eventId={eventId}>
      <ForceLightMode />
      <div className="fixed top-3 right-3 z-50">
        <LanguageSwitcher />
      </div>
      {children}
    </RegistrationProvider>
  );
}
