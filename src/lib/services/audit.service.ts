import type { SupabaseClient } from "@supabase/supabase-js";

interface AuditLogEntry {
  event_id?: string | null;
  user_id: string;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  details?: Record<string, unknown> | null;
  ip_address?: string | null;
}

/**
 * Write an audit log entry.
 */
export async function writeAuditLog(
  supabase: SupabaseClient,
  entry: AuditLogEntry
): Promise<void> {
  await supabase.from("eckcm_audit_logs").insert({
    event_id: entry.event_id ?? null,
    user_id: entry.user_id,
    action: entry.action,
    target_type: entry.target_type ?? null,
    target_id: entry.target_id ?? null,
    details: entry.details ?? null,
    ip_address: entry.ip_address ?? null,
  });
}

/**
 * Write multiple audit log entries in a batch.
 */
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
      target_type: entry.target_type ?? null,
      target_id: entry.target_id ?? null,
      details: entry.details ?? null,
      ip_address: entry.ip_address ?? null,
    }))
  );
}
