-- Rollback for 20260603130000_participant-title-single-name.sql
ALTER TABLE eckcm_participant_titles RENAME COLUMN name TO name_en;
ALTER TABLE eckcm_participant_titles ADD COLUMN IF NOT EXISTS name_ko text;
