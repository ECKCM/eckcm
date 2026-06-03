-- Participant Titles: an admin-managed taxonomy of event-participation titles
-- (e.g. Speaker/강사, Staff/스태프, VIP, Leader/인도자).
--
-- Distinct from the per-person church_role (직분) on eckcm_people: a title is
-- assigned to a person's participation in a specific event — i.e. to one
-- eckcm_group_memberships row — so the same person can hold a different title
-- each year. One title per participant (single FK; ON DELETE SET NULL so
-- deleting a title clears it from participants rather than blocking).

CREATE TABLE IF NOT EXISTS eckcm_participant_titles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en     text NOT NULL,
  name_ko     text,
  color       text,                          -- optional hex (e.g. '#2563eb') for the badge
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION eckcm_participant_titles_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_participant_titles_touch ON eckcm_participant_titles;
CREATE TRIGGER trg_participant_titles_touch
  BEFORE UPDATE ON eckcm_participant_titles
  FOR EACH ROW EXECUTE FUNCTION eckcm_participant_titles_touch();

-- ─── RLS (mirrors eckcm_willow_assignments / shared taxonomy tables) ───
-- Any authenticated user may read the title list (needed to render badges and
-- the assignment dropdown); only SUPER_ADMIN / EVENT_ADMIN may manage it.
ALTER TABLE eckcm_participant_titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY participant_titles_select_authenticated
  ON eckcm_participant_titles FOR SELECT TO authenticated USING (true);

CREATE POLICY participant_titles_insert_admin
  ON eckcm_participant_titles FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM eckcm_staff_assignments sa
    JOIN eckcm_roles r ON r.id = sa.role_id
    WHERE sa.user_id = auth.uid() AND sa.is_active = true
      AND r.name = ANY (ARRAY['SUPER_ADMIN'::eckcm_staff_role, 'EVENT_ADMIN'::eckcm_staff_role])
  ));

CREATE POLICY participant_titles_update_admin
  ON eckcm_participant_titles FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM eckcm_staff_assignments sa
    JOIN eckcm_roles r ON r.id = sa.role_id
    WHERE sa.user_id = auth.uid() AND sa.is_active = true
      AND r.name = ANY (ARRAY['SUPER_ADMIN'::eckcm_staff_role, 'EVENT_ADMIN'::eckcm_staff_role])
  ));

CREATE POLICY participant_titles_delete_admin
  ON eckcm_participant_titles FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM eckcm_staff_assignments sa
    JOIN eckcm_roles r ON r.id = sa.role_id
    WHERE sa.user_id = auth.uid() AND sa.is_active = true
      AND r.name = ANY (ARRAY['SUPER_ADMIN'::eckcm_staff_role, 'EVENT_ADMIN'::eckcm_staff_role])
  ));

-- Realtime so the management table updates live across admins.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'eckcm_participant_titles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE eckcm_participant_titles';
  END IF;
END;
$$;

-- ─── Per-participation title (one per membership) ───
ALTER TABLE eckcm_group_memberships
  ADD COLUMN IF NOT EXISTS title_id uuid
  REFERENCES eckcm_participant_titles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_group_memberships_title
  ON eckcm_group_memberships (title_id);

COMMENT ON TABLE eckcm_participant_titles IS
  'Admin-managed taxonomy of event-participation titles (Speaker, Staff, VIP, …). Assigned to eckcm_group_memberships.title_id (per-event, one per participant). Distinct from eckcm_people.church_role (직분).';
COMMENT ON COLUMN eckcm_group_memberships.title_id IS
  'Optional participant title for this event participation. FK → eckcm_participant_titles. NULL = no title.';
