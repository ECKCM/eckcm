import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AdminRegistrationForm } from "./admin-registration-form";

export default function AdminRegistrationCreatePage() {
  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Manual Registration</h1>
      </header>
      <div className="p-6">
        <AdminRegistrationForm />
      </div>
    </div>
  );
}
