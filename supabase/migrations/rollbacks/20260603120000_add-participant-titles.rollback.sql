-- Rollback for 20260603120000_add-participant-titles.sql

-- Drop the per-participation title FK/column first (references the table below).
DROP INDEX IF EXISTS idx_group_memberships_title;
ALTER TABLE eckcm_group_memberships DROP COLUMN IF EXISTS title_id;

-- Remove from realtime publication before dropping the table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'eckcm_participant_titles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE eckcm_participant_titles';
  END IF;
END;
$$;

DROP TABLE IF EXISTS eckcm_participant_titles CASCADE;
DROP FUNCTION IF EXISTS eckcm_participant_titles_touch();
