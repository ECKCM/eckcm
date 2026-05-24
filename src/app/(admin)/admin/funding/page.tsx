import { FundingTracker } from "./funding-tracker";

export default function FundingPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Funding Tracker</h1>
      </div>
      <div className="p-6 space-y-6">
        <p className="text-sm text-muted-foreground">
          Track funding allocations by sponsor and collect reimbursements.
        </p>
        <FundingTracker />
      </div>
    </div>
  );
}
