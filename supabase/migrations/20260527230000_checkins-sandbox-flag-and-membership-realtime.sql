-- Two related changes:
--   1. Tag each check-in with whether it came from a sandbox scan session
--      (`is_sandbox`). Sandbox scans now ARE persisted so they show up in the
--      Scan Sessions historical viewer — but they don't affect real counts or
--      the unique constraints that prevent double check-ins for real attendees.
--   2. Add `eckcm_group_memberships` to the supabase_realtime publication so
--      operator devices get notified the instant a new participant is added
--      (e.g. a late walk-in registration) and can refresh their offline cache.

ALTER TABLE eckcm_checkins
  ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;

-- Rebuild the three partial unique indexes so they only apply to real
-- check-ins. Sandbox rows are free of these constraints — staff can
-- "test scan" the same participant repeatedly without errors.
DROP INDEX IF EXISTS idx_checkin_dining;
DROP INDEX IF EXISTS idx_checkin_main;
DROP INDEX IF EXISTS idx_checkin_session;

CREATE UNIQUE INDEX idx_checkin_dining
  ON eckcm_checkins (event_id, person_id, meal_date, meal_type)
  WHERE checkin_type = 'DINING' AND is_sandbox = false;

CREATE UNIQUE INDEX idx_checkin_main
  ON eckcm_checkins (event_id, person_id, checkin_type)
  WHERE checkin_type = 'MAIN' AND is_sandbox = false;

CREATE UNIQUE INDEX idx_checkin_session
  ON eckcm_checkins (event_id, person_id, session_id)
  WHERE checkin_type = 'SESSION' AND is_sandbox = false;

-- Index for fast "show me only real check-ins for this event" stat queries.
CREATE INDEX IF NOT EXISTS idx_checkin_event_real
  ON eckcm_checkins (event_id, checkin_type)
  WHERE is_sandbox = false;

-- Realtime: notify operator clients when a new membership / participant
-- code is created, so they can pull deltas into the offline cache.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'eckcm_group_memberships'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE eckcm_group_memberships';
  END IF;
END;
$$;

COMMENT ON COLUMN eckcm_checkins.is_sandbox IS
  'True when this check-in row was recorded by a sandbox scan session (test mode). Excluded from real attendance counts and uniqueness checks.';
