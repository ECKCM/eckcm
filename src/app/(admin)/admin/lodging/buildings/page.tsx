import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function BuildingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: buildings } = await supabase
    .from("eckcm_buildings")
    .select(`
      id, name, description,
      eckcm_floors(
        id, floor_number, label,
        eckcm_rooms(id, room_number, capacity, is_available)
      )
    `)
    .order("name");

  const buildingList = buildings ?? [];

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Buildings & Rooms</h1>
      </header>
      <div className="p-6">
        {buildingList.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">
              No buildings configured. Add buildings in{" "}
              <a href="/admin/settings/lodging" className="underline">
                Lodging Settings
              </a>.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {buildingList.map((building: any) => (
              <div key={building.id} className="rounded-lg border">
                <div className="border-b p-4">
                  <h2 className="text-lg font-semibold">{building.name}</h2>
                  {building.description && (
                    <p className="text-sm text-muted-foreground">{building.description}</p>
                  )}
                </div>
                <div className="p-4">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(building.eckcm_floors ?? []).map((floor: any) => (
                    <div key={floor.id} className="mb-3">
                      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                        {floor.label || `Floor ${floor.floor_number}`}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(floor.eckcm_rooms ?? []).map((room: any) => (
                          <div
                            key={room.id}
                            className={`rounded border px-3 py-1.5 text-sm ${
                              room.is_available
                                ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                                : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                            }`}
                          >
                            {room.room_number} (cap: {room.capacity})
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
