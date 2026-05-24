import { DepartmentsManager } from "./departments-manager";

export default function DepartmentsPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Departments</h1>
      </div>
      <div className="p-6">
        <DepartmentsManager />
      </div>
    </div>
  );
}
