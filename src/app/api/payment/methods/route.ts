import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eckcm_app_config")
    .select("enabled_payment_methods")
    .eq("id", 1)
    .single();

  if (error || !data) {
    // Default: all methods enabled
    return NextResponse.json({
      enabled: ["card", "ach", "zelle", "check", "wallet", "more"],
    });
  }

  return NextResponse.json({
    enabled: data.enabled_payment_methods ?? ["card", "ach", "zelle", "check", "wallet", "more"],
  });
}
