import { RolesManager } from "./roles-manager";

export default function RolesPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Roles</h1>
      </div>
      <div className="p-6">
        <RolesManager />
      </div>
    </div>
  );
}
