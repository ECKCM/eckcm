import { StripeConfigManager } from "./stripe-config-manager";

export default function StripeSettingsPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Stripe Configuration</h1>
      </div>
      <div className="p-6">
        <StripeConfigManager />
      </div>
    </div>
  );
}
