import { createClient } from "@/lib/supabase/server";
import { SupportContent } from "./support-content";

export default async function SupportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <SupportContent isLoggedIn={!!user} />;
}
