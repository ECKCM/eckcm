import { MealTimesClient } from "./meal-times-client";

export default function MealTimesSettingsPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Meal Times</h1>
      </div>
      <div className="p-6 max-w-2xl">
        <MealTimesClient />
      </div>
    </div>
  );
}
