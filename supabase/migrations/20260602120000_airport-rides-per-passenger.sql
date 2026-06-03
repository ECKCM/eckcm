-- Airport rides become per-passenger.
--
-- Before: eckcm_registration_rides stored one row per (registration, ride) with
-- a `passenger_count` integer. The public wizard let users pick WHICH
-- participants ride, but submit discarded that and kept only the count — so the
-- admin Airport checklist had to expand every member of the registration onto
-- the ride (over-counting), and there was no per-person data for admins to edit.
--
-- After: each row is one PERSON on one ride (`person_id`). This lets the
-- registration detail view assign airport pickup/dropoff per participant, makes
-- the Airport checklist accurate, and persists the wizard's existing selection.

ALTER TABLE eckcm_registration_rides
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES eckcm_people(id) ON DELETE CASCADE;

-- The old model enforced one row per (registration, ride). Per-passenger rows
-- need this gone before backfill.
ALTER TABLE eckcm_registration_rides
  DROP CONSTRAINT IF EXISTS eckcm_registration_rides_registration_id_ride_id_key;

-- Backfill: expand each existing (registration, ride) booking into one row per
-- participant of that registration — mirrors exactly how the checklist used to
-- display them, so no one silently loses/gains a ride.
INSERT INTO eckcm_registration_rides (registration_id, ride_id, person_id, passenger_count, flight_info)
SELECT DISTINCT rr.registration_id, rr.ride_id, gm.person_id, 1, rr.flight_info
FROM eckcm_registration_rides rr
JOIN eckcm_groups g ON g.registration_id = rr.registration_id
JOIN eckcm_group_memberships gm ON gm.group_id = g.id
WHERE rr.person_id IS NULL;

-- Drop the old aggregate rows now that per-person rows exist.
DELETE FROM eckcm_registration_rides WHERE person_id IS NULL;

-- One row per passenger per ride; speeds up "who is on this ride" lookups.
CREATE UNIQUE INDEX IF NOT EXISTS eckcm_registration_rides_ride_person_idx
  ON eckcm_registration_rides (ride_id, person_id);

CREATE INDEX IF NOT EXISTS eckcm_registration_rides_person_idx
  ON eckcm_registration_rides (person_id);

COMMENT ON COLUMN eckcm_registration_rides.person_id IS
  'The specific participant assigned to this ride. One row = one passenger on one ride.';
