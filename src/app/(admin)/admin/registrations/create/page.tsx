import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminRegistrationCreatePage() {
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("eckcm_events")
    .select("id")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!event) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <h1 className="text-lg font-semibold">Register for Others</h1>
        </div>
        <div className="p-6 text-sm text-muted-foreground">
          No active event is available for registration.
        </div>
      </div>
    );
  }

  redirect(`/register/${event.id}?type=others`);
}
