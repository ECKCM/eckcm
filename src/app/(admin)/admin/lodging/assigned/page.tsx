import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AssignedRoomsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: assigned } = await supabase
    .from("eckcm_room_assignments")
    .select(`
      id, group_id, room_id, status,
      eckcm_rooms!inner(
        room_number,
        eckcm_floors!inner(
          label, floor_number,
          eckcm_buildings!inner(name)
        )
      ),
      eckcm_groups!inner(
        group_name,
        eckcm_registrations!inner(confirmation_code)
      )
    `)
    .eq("status", "ASSIGNED")
    .order("created_at", { ascending: false });

  const assignedList = assigned ?? [];

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Assigned Rooms</h1>
      </header>
      <div className="p-6">
        {assignedList.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">
              No room assignments yet. Assign rooms from the pending page.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left text-sm font-medium">Building</th>
                  <th className="p-3 text-left text-sm font-medium">Room</th>
                  <th className="p-3 text-left text-sm font-medium">Group</th>
                  <th className="p-3 text-left text-sm font-medium">Registration</th>
                </tr>
              </thead>
              <tbody>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {assignedList.map((a: any) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="p-3 text-sm">
                      {a.eckcm_rooms?.eckcm_floors?.eckcm_buildings?.name ?? "—"}
                    </td>
                    <td className="p-3 text-sm font-mono">
                      {a.eckcm_rooms?.room_number ?? "—"}
                    </td>
                    <td className="p-3 text-sm">
                      {a.eckcm_groups?.group_name ?? "—"}
                    </td>
                    <td className="p-3 text-sm font-mono">
                      {a.eckcm_groups?.eckcm_registrations?.confirmation_code ?? "—"}
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
