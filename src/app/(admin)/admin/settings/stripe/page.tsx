import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { StripeConfigManager } from "./stripe-config-manager";

export default function StripeSettingsPage() {
  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Stripe Configuration</h1>
      </header>
      <div className="p-6">
        <StripeConfigManager />
      </div>
    </div>
  );
}
