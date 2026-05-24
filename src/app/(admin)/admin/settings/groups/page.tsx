import { RegistrationGroupsManager } from "./groups-manager";

export default function GroupsPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Registration Groups</h1>
      </div>
      <div className="p-6">
        <RegistrationGroupsManager />
      </div>
    </div>
  );
}
