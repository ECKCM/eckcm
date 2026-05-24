import { LodgingManager } from "./lodging-manager";

export default function LodgingSettingsPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Lodging Management</h1>
      </div>
      <div className="p-6">
        <LodgingManager />
      </div>
    </div>
  );
}
