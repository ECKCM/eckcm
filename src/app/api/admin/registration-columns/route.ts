import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * Global column layout (order + visibility) for the admin Registrations table.
 * Stored on the singleton eckcm_app_config row and shared across all admins.
 *
 * There are two independent layouts: the normal table view and the
 * "Needs Attention" view. They share one JSONB column for backward
 * compatibility:
 *   - Legacy shape (array)            → the default layout; attention = null.
 *   - Current shape ({ default, attention }) → both layouts.
 * Each layout is Array<{ id: string; visible: boolean }> or NULL (code default).
 */
type ColumnLayout = Array<{ id: string; visible: boolean }> | null;
type StoredColumns =
  | ColumnLayout
  | { default?: ColumnLayout; attention?: ColumnLayout };

/** Split the stored value into the two layouts, tolerating the legacy array. */
function readLayouts(stored: StoredColumns): {
  columns: ColumnLayout;
  attentionColumns: ColumnLayout;
} {
  if (Array.isArray(stored) || stored === null || stored === undefined) {
    return { columns: (stored as ColumnLayout) ?? null, attentionColumns: null };
  }
  return {
    columns: stored.default ?? null,
    attentionColumns: stored.attention ?? null,
  };
}

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

  const { columns, attentionColumns } = readLayouts(
    data.registration_table_columns as StoredColumns
  );

  return NextResponse.json({ columns, attentionColumns });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = auth;

  const body = await request.json().catch(() => null);
  const columns = body?.columns;
  // Which layout to write: the normal table view or the Needs Attention view.
  const mode = body?.mode === "attention" ? "attention" : "default";

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
  const normalized: ColumnLayout =
    columns === null
      ? null
      : (columns as Array<{ id: string; visible: boolean }>).map((c) => ({
          id: c.id,
          visible: c.visible,
        }));

  const admin = createAdminClient();

  // Read the current value so we update only the targeted layout and preserve
  // the other one. Migrate the legacy array shape to the { default, attention }
  // object on first write.
  const { data: current, error: readErr } = await admin
    .from("eckcm_app_config")
    .select("registration_table_columns")
    .eq("id", 1)
    .single();

  if (readErr || !current) {
    return NextResponse.json({ error: "Failed to fetch config" }, { status: 500 });
  }

  const existing = readLayouts(
    current.registration_table_columns as StoredColumns
  );
  const merged = {
    default: mode === "default" ? normalized : existing.columns,
    attention: mode === "attention" ? normalized : existing.attentionColumns,
  };

  const { error } = await admin
    .from("eckcm_app_config")
    .update({ registration_table_columns: merged })
    .eq("id", 1);

  if (error) {
    return NextResponse.json({ error: "Failed to update config" }, { status: 500 });
  }

  await admin.from("eckcm_audit_logs").insert({
    user_id: user.id,
    action: "UPDATE_REGISTRATION_TABLE_COLUMNS",
    entity_type: "app_config",
    entity_id: "1",
    new_data: { registration_table_columns: merged, mode },
  });

  return NextResponse.json({ success: true, columns: normalized, mode });
}
