import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * Global column layout (order + visibility) for the admin Registrations table.
 * Stored on the singleton eckcm_app_config row and shared across all admins.
 * Shape: Array<{ id: string; visible: boolean }>. NULL = use code default.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eckcm_app_config")
    .select("registration_table_columns")
    .eq("id", 1)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to fetch config" }, { status: 500 });
  }

  return NextResponse.json({
    columns: data.registration_table_columns ?? null,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = auth;

  const body = await request.json().catch(() => null);
  const columns = body?.columns;

  // null is allowed and means "reset to code default".
  if (columns !== null) {
    if (!Array.isArray(columns)) {
      return NextResponse.json(
        { error: "columns must be an array or null" },
        { status: 400 }
      );
    }
    const seen = new Set<string>();
    for (const c of columns) {
      if (
        !c ||
        typeof c.id !== "string" ||
        c.id.length === 0 ||
        typeof c.visible !== "boolean"
      ) {
        return NextResponse.json(
          { error: "Each column must be { id: string, visible: boolean }" },
          { status: 400 }
        );
      }
      if (seen.has(c.id)) {
        return NextResponse.json(
          { error: `Duplicate column id: ${c.id}` },
          { status: 400 }
        );
      }
      seen.add(c.id);
    }
  }

  // Persist only the minimal { id, visible } shape (ignore any extra props).
  const normalized =
    columns === null
      ? null
      : (columns as Array<{ id: string; visible: boolean }>).map((c) => ({
          id: c.id,
          visible: c.visible,
        }));

  const admin = createAdminClient();
  const { error } = await admin
    .from("eckcm_app_config")
    .update({ registration_table_columns: normalized })
    .eq("id", 1);

  if (error) {
    return NextResponse.json({ error: "Failed to update config" }, { status: 500 });
  }

  await admin.from("eckcm_audit_logs").insert({
    user_id: user.id,
    action: "UPDATE_REGISTRATION_TABLE_COLUMNS",
    entity_type: "app_config",
    entity_id: "1",
    new_data: { registration_table_columns: normalized },
  });

  return NextResponse.json({ success: true, columns: normalized });
}
