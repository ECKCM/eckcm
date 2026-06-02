-- Rollback for 20260601130000_add-willow-participant-assignments.sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'eckcm_willow_assignments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE eckcm_willow_assignments';
  END IF;
END;
$$;

DROP TABLE IF EXISTS eckcm_willow_assignments CASCADE;
DROP FUNCTION IF EXISTS eckcm_willow_room_capacity_guard();
DROP FUNCTION IF EXISTS eckcm_willow_assignments_touch();
