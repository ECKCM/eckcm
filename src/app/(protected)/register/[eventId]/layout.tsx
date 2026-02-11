import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RegistrationProvider } from "@/lib/context/registration-context";

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
    .from("ECKCM_events")
    .select("id, name_en, is_active")
    .eq("id", eventId)
    .eq("is_active", true)
    .single();

  if (!event) {
    notFound();
  }

  return (
    <RegistrationProvider eventId={eventId}>{children}</RegistrationProvider>
  );
}
