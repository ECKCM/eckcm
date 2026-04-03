-- Add checkin_status column to eckcm_checkins table
-- Tracks whether a check-in is active or has been cancelled/checked-out
ALTER TABLE eckcm_checkins
  ADD COLUMN status TEXT NOT NULL DEFAULT 'CHECKED_IN'
  CONSTRAINT eckcm_checkins_status_check CHECK (status IN ('CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW'));

-- Add checkin_status column to eckcm_registrations table
-- Summarizes overall check-in state for the registration
ALTER TABLE eckcm_registrations
  ADD COLUMN checkin_status TEXT NOT NULL DEFAULT 'NOT_CHECKED_IN'
  CONSTRAINT eckcm_registrations_checkin_status_check CHECK (checkin_status IN ('NOT_CHECKED_IN', 'CHECKED_IN', 'CHECKED_OUT'));

-- Index for filtering registrations by checkin status (admin views)
CREATE INDEX idx_eckcm_registrations_checkin_status ON eckcm_registrations(checkin_status);

-- Index for filtering checkins by status
CREATE INDEX idx_eckcm_checkins_status ON eckcm_checkins(status);

COMMENT ON COLUMN eckcm_checkins.status IS 'Check-in record status: CHECKED_IN, CHECKED_OUT, CANCELLED, NO_SHOW';
COMMENT ON COLUMN eckcm_registrations.checkin_status IS 'Overall check-in status for the registration: NOT_CHECKED_IN, CHECKED_IN, CHECKED_OUT';
