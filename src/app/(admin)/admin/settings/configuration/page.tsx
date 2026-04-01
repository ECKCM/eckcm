import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ConfigurationManager } from "./configuration-manager";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function ConfigurationPage() {
  // Read HMAC status server-side so it's available immediately
  const admin = createAdminClient();
  const { data } = await admin
    .from("eckcm_app_config")
    .select("epass_hmac_secret")
    .eq("id", 1)
    .single();

  const hmacSecret = data?.epass_hmac_secret as string | null;
  const initialHmacStatus = hmacSecret
    ? { is_set: true, last4: hmacSecret.slice(-4) }
    : { is_set: false, last4: "" };

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Configuration</h1>
      </header>
      <div className="p-6">
        <ConfigurationManager initialHmacStatus={initialHmacStatus} />
      </div>
    </div>
  );
}
