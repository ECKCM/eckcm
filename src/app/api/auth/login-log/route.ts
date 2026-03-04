import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const admin = createAdminClient();

  const actorName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    null;

  await admin.from("eckcm_audit_logs").insert({
    user_id: user.id,
    actor_name: actorName,
    action: body.action ?? "USER_LOGIN",
    entity_type: "auth",
    entity_id: user.id,
    new_data: body.metadata ?? null,
  });

  return NextResponse.json({ ok: true });
}
