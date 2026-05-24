import { GoogleSheetsManager } from "./google-sheets-manager";

export default function GoogleSheetsSettingsPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Google Sheets Integration</h1>
      </div>
      <div className="mx-auto w-full max-w-2xl p-6">
        <GoogleSheetsManager />
      </div>
    </div>
  );
}
