import { createClient } from "@/lib/supabase/server";
import { LegalManager } from "./legal-manager";

export default async function LegalPage() {
  const supabase = await createClient();

  const { data: pages } = await supabase
    .from("eckcm_legal_content")
    .select("*")
    .order("slug");

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Legal Pages</h1>
      </div>
      <div className="p-6">
        <LegalManager initialPages={pages ?? []} />
      </div>
    </div>
  );
}
