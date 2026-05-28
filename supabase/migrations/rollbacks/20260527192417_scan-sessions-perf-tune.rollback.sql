-- Rollback: revert perf tune. Restores the original (un-subquery) RLS
-- policies and removes the FK indexes added in this migration. RLS itself
-- stays enabled — only the policies are recreated to match the version
-- introduced in 20260527192311_scan-sessions-rls.sql.

DROP INDEX IF EXISTS idx_eckcm_scan_sessions_session_id;
DROP INDEX IF EXISTS idx_eckcm_scan_sessions_started_by;

DROP POLICY IF EXISTS scan_sessions_read   ON eckcm_scan_sessions;
DROP POLICY IF EXISTS scan_sessions_insert ON eckcm_scan_sessions;
DROP POLICY IF EXISTS scan_sessions_update ON eckcm_scan_sessions;
DROP POLICY IF EXISTS scan_sessions_delete ON eckcm_scan_sessions;

CREATE POLICY scan_sessions_read
  ON eckcm_scan_sessions
  FOR SELECT
  USING (is_active_staff(auth.uid()));

CREATE POLICY scan_sessions_insert
  ON eckcm_scan_sessions
  FOR INSERT
  WITH CHECK (has_event_permission(auth.uid(), event_id, 'checkin.manage'));

CREATE POLICY scan_sessions_update
  ON eckcm_scan_sessions
  FOR UPDATE
  USING (has_event_permission(auth.uid(), event_id, 'checkin.manage'))
  WITH CHECK (has_event_permission(auth.uid(), event_id, 'checkin.manage'));

CREATE POLICY scan_sessions_delete
  ON eckcm_scan_sessions
  FOR DELETE
  USING (is_super_admin(auth.uid()));
