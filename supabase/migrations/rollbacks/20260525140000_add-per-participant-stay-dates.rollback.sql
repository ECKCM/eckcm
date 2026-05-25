ALTER TABLE eckcm_group_memberships
  DROP CONSTRAINT IF EXISTS eckcm_group_memberships_stay_dates_check;

ALTER TABLE eckcm_group_memberships
  DROP COLUMN IF EXISTS stay_end_date,
  DROP COLUMN IF EXISTS stay_start_date;
