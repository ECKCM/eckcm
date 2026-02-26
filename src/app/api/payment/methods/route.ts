import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eckcm_app_config")
    .select("enabled_payment_methods, donor_covers_fees_registration")
    .eq("id", 1)
    .single();

  if (error || !data) {
    // Default: all methods enabled
    return NextResponse.json({
      enabled: ["card", "ach", "zelle", "check", "wallet", "more"],
      donorCoversFees: false,
    });
  }

  return NextResponse.json({
    enabled: data.enabled_payment_methods ?? ["card", "ach", "zelle", "check", "wallet", "more"],
    donorCoversFees: data.donor_covers_fees_registration ?? false,
  });
}
