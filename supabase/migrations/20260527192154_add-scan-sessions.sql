-- Scan Session lifecycle for check-in operators.
-- A scan session represents a time-bounded window during which one or more
-- staff phones/kiosks accept QR scans for a specific purpose (e.g. Thursday
-- dinner). Multiple operators can attach to the same session for synced
-- Recent Check-ins, and the session can be paused/resumed/ended without
-- losing its history.

CREATE TABLE IF NOT EXISTS eckcm_scan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES eckcm_events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CONSTRAINT eckcm_scan_sessions_kind_check
      CHECK (kind IN (
        'MAIN_CHECKIN',
        'CHECKOUT',
        'MEAL_BREAKFAST',
        'MEAL_LUNCH',
        'MEAL_DINNER',
        'SESSION',
        'OTHER'
      )),
  label TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CONSTRAINT eckcm_scan_sessions_status_check
      CHECK (status IN ('ACTIVE', 'PAUSED', 'ENDED')),
  is_sandbox boolean NOT NULL DEFAULT false,

  -- Kind-specific context. Only one of these will typically be set.
  meal_date date,
  session_id uuid REFERENCES eckcm_sessions(id) ON DELETE SET NULL,

  started_at timestamptz NOT NULL DEFAULT NOW(),
  ended_at timestamptz,
  paused_at timestamptz,

  started_by uuid NOT NULL REFERENCES auth.users(id),
  ended_by uuid REFERENCES auth.users(id),

  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Find the active scan session for a given event quickly.
CREATE INDEX IF NOT EXISTS idx_eckcm_scan_sessions_event_status
  ON eckcm_scan_sessions(event_id, status);

-- Operators commonly filter by kind to find "the active dinner session".
CREATE INDEX IF NOT EXISTS idx_eckcm_scan_sessions_kind_status
  ON eckcm_scan_sessions(kind, status);

-- Tag each check-in with the scan session it came from so admins can review
-- exactly which scans happened during a particular session.
ALTER TABLE eckcm_checkins
  ADD COLUMN IF NOT EXISTS scan_session_id uuid
    REFERENCES eckcm_scan_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_eckcm_checkins_scan_session
  ON eckcm_checkins(scan_session_id)
  WHERE scan_session_id IS NOT NULL;

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION eckcm_scan_sessions_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_eckcm_scan_sessions_touch ON eckcm_scan_sessions;
CREATE TRIGGER trg_eckcm_scan_sessions_touch
  BEFORE UPDATE ON eckcm_scan_sessions
  FOR EACH ROW
  EXECUTE FUNCTION eckcm_scan_sessions_touch_updated_at();

-- Enable Supabase Realtime so every connected operator sees new check-ins
-- the moment they hit the DB.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'eckcm_checkins'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE eckcm_checkins';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'eckcm_scan_sessions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE eckcm_scan_sessions';
  END IF;
END;
$$;

COMMENT ON TABLE eckcm_scan_sessions IS
  'Operator-driven check-in scanning sessions. One session per meal / arrival window. Multiple staff can attach to the same session.';
COMMENT ON COLUMN eckcm_scan_sessions.is_sandbox IS
  'When true, scans tagged with this session are recorded for UI testing only — verify API skips the eckcm_checkins insert.';
COMMENT ON COLUMN eckcm_checkins.scan_session_id IS
  'Scan session the check-in originated from (null for check-ins recorded before scan sessions existed).';
