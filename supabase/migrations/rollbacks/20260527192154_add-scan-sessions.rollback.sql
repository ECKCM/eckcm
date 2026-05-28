-- Rollback: drop scan-session lifecycle objects.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'eckcm_scan_sessions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE eckcm_scan_sessions';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_eckcm_scan_sessions_touch ON eckcm_scan_sessions;
DROP FUNCTION IF EXISTS eckcm_scan_sessions_touch_updated_at();

DROP INDEX IF EXISTS idx_eckcm_checkins_scan_session;
ALTER TABLE eckcm_checkins DROP COLUMN IF EXISTS scan_session_id;

DROP INDEX IF EXISTS idx_eckcm_scan_sessions_kind_status;
DROP INDEX IF EXISTS idx_eckcm_scan_sessions_event_status;
DROP TABLE IF EXISTS eckcm_scan_sessions;
