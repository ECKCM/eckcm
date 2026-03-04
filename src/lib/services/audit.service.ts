import type { SupabaseClient } from "@supabase/supabase-js";

interface AuditLogEntry {
  event_id?: string | null;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  new_data?: Record<string, unknown> | null;
  old_data?: Record<string, unknown> | null;
  ip_address?: string | null;
}

export async function writeAuditLog(
  supabase: SupabaseClient,
  entry: AuditLogEntry
): Promise<void> {
  await supabase.from("eckcm_audit_logs").insert({
    event_id: entry.event_id ?? null,
    user_id: entry.user_id,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id ?? null,
    new_data: entry.new_data ?? null,
    old_data: entry.old_data ?? null,
    ip_address: entry.ip_address ?? null,
  });
}

export async function writeAuditLogBatch(
  supabase: SupabaseClient,
  entries: AuditLogEntry[]
): Promise<void> {
  if (entries.length === 0) return;

  await supabase.from("eckcm_audit_logs").insert(
    entries.map((entry) => ({
      event_id: entry.event_id ?? null,
      user_id: entry.user_id,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id ?? null,
      new_data: entry.new_data ?? null,
      old_data: entry.old_data ?? null,
      ip_address: entry.ip_address ?? null,
    }))
  );
}
