-- Meal schedule windows (breakfast / lunch / dinner) used by the meal scanner
-- to suggest the right meal based on the current time. Stored as a JSONB blob
-- on the singleton eckcm_app_config row so admins can edit it from one settings
-- page.

ALTER TABLE eckcm_app_config
  ADD COLUMN IF NOT EXISTS meal_schedule jsonb NOT NULL DEFAULT jsonb_build_object(
    'breakfast', jsonb_build_object('start', '07:00', 'end', '09:30'),
    'lunch',     jsonb_build_object('start', '12:00', 'end', '13:30'),
    'dinner',    jsonb_build_object('start', '18:00', 'end', '19:30')
  );

COMMENT ON COLUMN eckcm_app_config.meal_schedule IS
  'Meal time windows. Shape: { breakfast|lunch|dinner: { start: "HH:MM", end: "HH:MM" } }. Used by /admin/checkin/meal scanner to suggest current meal.';
