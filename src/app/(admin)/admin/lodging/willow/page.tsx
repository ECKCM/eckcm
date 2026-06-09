import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { WillowAssignment } from "./willow-assignment";

export default async function WillowAssignmentPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("eckcm_events")
    .select("id, name_en, year")
    .order("is_default", { ascending: false })
    .order("year", { ascending: false });

  // Hansamo department viewers (and no broader admin role) are locked to the
  // Hansamo participant pool. Roles are forwarded by middleware via x-user-roles.
  const roles: string[] = JSON.parse((await headers()).get("x-user-roles") ?? "[]");
  const hansamoOnly =
    roles.includes("DEPARTMENT_VIEWER_HANSAMO") &&
    !roles.includes("SUPER_ADMIN") &&
    !roles.includes("EVENT_ADMIN") &&
    !roles.includes("DEPARTMENT_ADMIN");

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)]">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Willow Hall — Participant Assignment</h1>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <WillowAssignment events={events ?? []} hansamoOnly={hansamoOnly} />
      </div>
    </div>
  );
}
