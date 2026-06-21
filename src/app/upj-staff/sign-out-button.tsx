"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { logAuthEvent } from "@/lib/audit-client";

export function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await logAuthEvent("USER_LOGOUT");
    await supabase.auth.signOut();
    router.push("/upj-staff/login");
    router.refresh();
  };

  return (
    <Button variant="outline" size="sm" onClick={handleSignOut}>
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </Button>
  );
}
