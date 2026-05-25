-- Per-participant stay date overrides. Null = use registration default
-- (eckcm_registrations.start_date / end_date). Must be set as a pair.

ALTER TABLE eckcm_group_memberships
  ADD COLUMN IF NOT EXISTS stay_start_date date,
  ADD COLUMN IF NOT EXISTS stay_end_date date;

ALTER TABLE eckcm_group_memberships
  DROP CONSTRAINT IF EXISTS eckcm_group_memberships_stay_dates_check;

ALTER TABLE eckcm_group_memberships
  ADD CONSTRAINT eckcm_group_memberships_stay_dates_check
  CHECK (
    (stay_start_date IS NULL AND stay_end_date IS NULL)
    OR (stay_start_date IS NOT NULL AND stay_end_date IS NOT NULL AND stay_end_date >= stay_start_date)
  );
