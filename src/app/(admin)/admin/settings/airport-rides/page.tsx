import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AirportRidesManager } from "./airport-rides-manager";

export default function AirportRidesPage() {
  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Airport Rides</h1>
      </header>
      <div className="p-6">
        <AirportRidesManager />
      </div>
    </div>
  );
}
