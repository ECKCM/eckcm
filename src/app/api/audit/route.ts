import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const admin = createAdminClient();

  const actorName =
    auth.user.user_metadata?.full_name ||
    auth.user.user_metadata?.name ||
    auth.user.email?.split("@")[0] ||
    null;

  await admin.from("eckcm_audit_logs").insert({
    user_id: auth.user.id,
    actor_name: actorName,
    action: body.action,
    entity_type: body.entity_type,
    entity_id: body.entity_id ?? null,
    new_data: body.new_data ?? null,
    event_id: body.event_id ?? null,
  });

  return NextResponse.json({ ok: true });
}
