-- Performance tweaks recommended by the Supabase database linter:
--   1. Rewrite RLS policies so `auth.uid()` evaluates once per query rather
--      than once per row (`auth_rls_initplan` lint).
--   2. Add covering indexes for FKs that operators may filter by.

DROP POLICY IF EXISTS scan_sessions_read   ON eckcm_scan_sessions;
DROP POLICY IF EXISTS scan_sessions_insert ON eckcm_scan_sessions;
DROP POLICY IF EXISTS scan_sessions_update ON eckcm_scan_sessions;
DROP POLICY IF EXISTS scan_sessions_delete ON eckcm_scan_sessions;

CREATE POLICY scan_sessions_read
  ON eckcm_scan_sessions
  FOR SELECT
  USING (is_active_staff((SELECT auth.uid())));

CREATE POLICY scan_sessions_insert
  ON eckcm_scan_sessions
  FOR INSERT
  WITH CHECK (has_event_permission((SELECT auth.uid()), event_id, 'checkin.manage'));

CREATE POLICY scan_sessions_update
  ON eckcm_scan_sessions
  FOR UPDATE
  USING (has_event_permission((SELECT auth.uid()), event_id, 'checkin.manage'))
  WITH CHECK (has_event_permission((SELECT auth.uid()), event_id, 'checkin.manage'));

CREATE POLICY scan_sessions_delete
  ON eckcm_scan_sessions
  FOR DELETE
  USING (is_super_admin((SELECT auth.uid())));

CREATE INDEX IF NOT EXISTS idx_eckcm_scan_sessions_started_by
  ON eckcm_scan_sessions(started_by);
CREATE INDEX IF NOT EXISTS idx_eckcm_scan_sessions_session_id
  ON eckcm_scan_sessions(session_id) WHERE session_id IS NOT NULL;
