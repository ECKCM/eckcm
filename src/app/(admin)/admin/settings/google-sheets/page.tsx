import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { GoogleSheetsManager } from "./google-sheets-manager";

export default function GoogleSheetsSettingsPage() {
  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Google Sheets Integration</h1>
      </header>
      <div className="mx-auto w-full max-w-2xl p-6">
        <GoogleSheetsManager />
      </div>
    </div>
  );
}
