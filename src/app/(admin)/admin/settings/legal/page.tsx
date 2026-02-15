import { createClient } from "@/lib/supabase/server";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { LegalManager } from "./legal-manager";

export default async function LegalPage() {
  const supabase = await createClient();

  const { data: pages } = await supabase
    .from("eckcm_legal_content")
    .select("*")
    .order("slug");

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Legal Pages</h1>
      </header>
      <div className="p-6">
        <LegalManager initialPages={pages ?? []} />
      </div>
    </div>
  );
}
