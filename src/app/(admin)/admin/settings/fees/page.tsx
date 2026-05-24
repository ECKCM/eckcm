import { FeeCategoriesManager } from "./fees-manager";

export default function FeesPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Fee Categories</h1>
      </div>
      <div className="p-6">
        <FeeCategoriesManager />
      </div>
    </div>
  );
}
