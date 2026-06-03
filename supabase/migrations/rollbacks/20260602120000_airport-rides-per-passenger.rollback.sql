-- Rollback: revert airport rides from per-passenger back to per-(registration,ride)
-- aggregate rows with a passenger_count.
--
-- NOTE: per-person granularity cannot be perfectly restored — we collapse the
-- per-person rows back into one row per (registration, ride) with a count.

DROP INDEX IF EXISTS eckcm_registration_rides_ride_person_idx;
DROP INDEX IF EXISTS eckcm_registration_rides_person_idx;

-- Re-aggregate per-person rows into one row per (registration, ride).
WITH agg AS (
  SELECT registration_id, ride_id,
         count(*)                       AS passenger_count,
         (array_agg(flight_info))[1]    AS flight_info
  FROM eckcm_registration_rides
  WHERE person_id IS NOT NULL
  GROUP BY registration_id, ride_id
)
INSERT INTO eckcm_registration_rides (registration_id, ride_id, person_id, passenger_count, flight_info)
SELECT registration_id, ride_id, NULL, passenger_count, flight_info FROM agg;

DELETE FROM eckcm_registration_rides WHERE person_id IS NOT NULL;

ALTER TABLE eckcm_registration_rides DROP COLUMN IF EXISTS person_id;

-- Restore the original one-row-per-(registration,ride) uniqueness.
ALTER TABLE eckcm_registration_rides
  ADD CONSTRAINT eckcm_registration_rides_registration_id_ride_id_key
  UNIQUE (registration_id, ride_id);
