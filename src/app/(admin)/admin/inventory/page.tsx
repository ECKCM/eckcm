import { InventoryManager } from "./inventory-manager";

export default function InventoryPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Inventory</h1>
      </div>
      <div className="p-6">
        <InventoryManager />
      </div>
    </div>
  );
}
