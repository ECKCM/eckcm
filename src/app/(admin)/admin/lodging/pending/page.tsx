import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function PendingAssignmentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: pending } = await supabase
    .from("eckcm_room_assignments")
    .select(`
      id, group_id, status,
      eckcm_groups!inner(
        id, group_name,
        eckcm_registrations!inner(confirmation_code, status)
      )
    `)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false });

  const pendingList = pending ?? [];

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Pending Room Assignments</h1>
      </header>
      <div className="p-6">
        {pendingList.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">
              No pending room assignments. All groups have been assigned.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left text-sm font-medium">Group</th>
                  <th className="p-3 text-left text-sm font-medium">Registration</th>
                  <th className="p-3 text-left text-sm font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {pendingList.map((assignment: any) => (
                  <tr key={assignment.id} className="border-b last:border-0">
                    <td className="p-3 text-sm">
                      {assignment.eckcm_groups?.group_name ?? "—"}
                    </td>
                    <td className="p-3 text-sm font-mono">
                      {assignment.eckcm_groups?.eckcm_registrations?.confirmation_code ?? "—"}
                    </td>
                    <td className="p-3">
                      <span className="inline-flex rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                        Pending
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
