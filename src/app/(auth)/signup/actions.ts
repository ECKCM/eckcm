"use server";

import { createClient } from "@/lib/supabase/server";

export async function checkEmailAvailability(
  email: string
): Promise<{ available: boolean }> {
  if (!email || !email.includes("@")) {
    return { available: false };
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("check_email_exists", {
    check_email: email,
  });

  return { available: !data };
}
