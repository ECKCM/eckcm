import { AirportRidesManager } from "./airport-rides-manager";

export default function AirportRidesPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Airport Rides</h1>
      </div>
      <div className="p-6">
        <AirportRidesManager />
      </div>
    </div>
  );
}
