import { AirportChecklist } from "./airport-checklist";

export default function AirportPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Airport Shuttle</h1>
      </div>
      <div className="p-6">
        <AirportChecklist />
      </div>
    </div>
  );
}
