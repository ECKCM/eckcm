-- Rollback: drop scan-session RLS policies and disable RLS.
DROP POLICY IF EXISTS scan_sessions_delete ON eckcm_scan_sessions;
DROP POLICY IF EXISTS scan_sessions_update ON eckcm_scan_sessions;
DROP POLICY IF EXISTS scan_sessions_insert ON eckcm_scan_sessions;
DROP POLICY IF EXISTS scan_sessions_read   ON eckcm_scan_sessions;
ALTER TABLE eckcm_scan_sessions DISABLE ROW LEVEL SECURITY;
