import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { FeeCategoriesManager } from "./fees-manager";

export default function FeesPage() {
  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Fee Categories</h1>
      </header>
      <div className="p-6">
        <FeeCategoriesManager />
      </div>
    </div>
  );
}
