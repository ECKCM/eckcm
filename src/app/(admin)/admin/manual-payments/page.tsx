import { ManualPaymentsManager } from "./manual-payments-manager";

export default function ManualPaymentsPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Zelle / Check Payments</h1>
      </div>
      <div className="p-6">
        <ManualPaymentsManager />
      </div>
    </div>
  );
}
