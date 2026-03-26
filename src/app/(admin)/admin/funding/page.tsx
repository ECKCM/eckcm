import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { FundingTracker } from "./funding-tracker";

export default function FundingPage() {
  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Funding Tracker</h1>
      </header>
      <div className="p-6 space-y-6">
        <p className="text-sm text-muted-foreground">
          Track funding allocations by sponsor and collect reimbursements.
        </p>
        <FundingTracker />
      </div>
    </div>
  );
}
