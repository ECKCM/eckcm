import { UPJLodgingManager } from "./upj-lodging-manager";

export default function UPJRoomsPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">UPJ Lodging Rooms</h1>
      </div>
      <UPJLodgingManager />
    </div>
  );
}
