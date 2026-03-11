import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groupId = req.nextUrl.searchParams.get("groupId");
  if (!groupId) {
    return NextResponse.json({ error: "groupId required" }, { status: 400 });
  }

  const { data: feeLinks } = await supabase
    .from("eckcm_registration_group_fee_categories")
    .select(
      "eckcm_fee_categories!inner(code, name_en, amount_cents, age_min, age_max, pricing_type)"
    )
    .eq("registration_group_id", groupId);

  const fees = (feeLinks ?? [])
    .map((row: any) => row.eckcm_fee_categories)
    .filter((f: any) => f.code.startsWith("MEAL_"));

  return NextResponse.json(fees);
}
