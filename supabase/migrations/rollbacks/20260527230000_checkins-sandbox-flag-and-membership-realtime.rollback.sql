-- Rollback: undo sandbox flag and membership realtime additions.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'eckcm_group_memberships'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE eckcm_group_memberships';
  END IF;
END;
$$;

DROP INDEX IF EXISTS idx_checkin_event_real;
DROP INDEX IF EXISTS idx_checkin_dining;
DROP INDEX IF EXISTS idx_checkin_main;
DROP INDEX IF EXISTS idx_checkin_session;

CREATE UNIQUE INDEX idx_checkin_dining
  ON eckcm_checkins (event_id, person_id, meal_date, meal_type)
  WHERE checkin_type = 'DINING';
CREATE UNIQUE INDEX idx_checkin_main
  ON eckcm_checkins (event_id, person_id, checkin_type)
  WHERE checkin_type = 'MAIN';
CREATE UNIQUE INDEX idx_checkin_session
  ON eckcm_checkins (event_id, person_id, session_id)
  WHERE checkin_type = 'SESSION';

ALTER TABLE eckcm_checkins DROP COLUMN IF EXISTS is_sandbox;
