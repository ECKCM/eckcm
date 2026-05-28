-- Rollback: remove meal_schedule column from app config.

ALTER TABLE eckcm_app_config DROP COLUMN IF EXISTS meal_schedule;
