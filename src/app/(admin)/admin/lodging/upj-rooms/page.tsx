import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { UPJLodgingManager } from "./upj-lodging-manager";

export default function UPJRoomsPage() {
  return (
    <div className="flex flex-col h-full">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">UPJ Lodging Rooms</h1>
      </header>
      <UPJLodgingManager />
    </div>
  );
}
