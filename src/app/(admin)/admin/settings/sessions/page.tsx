import { SessionsManager } from "./sessions-manager";

export default function SessionsSettingsPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Sessions</h1>
      </div>
      <div className="p-6">
        <SessionsManager />
      </div>
    </div>
  );
}
