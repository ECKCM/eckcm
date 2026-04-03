-- Rollback: Remove checkin status columns

DROP INDEX IF EXISTS idx_eckcm_checkins_status;
DROP INDEX IF EXISTS idx_eckcm_registrations_checkin_status;

ALTER TABLE eckcm_checkins DROP COLUMN IF EXISTS status;
ALTER TABLE eckcm_registrations DROP COLUMN IF EXISTS checkin_status;
