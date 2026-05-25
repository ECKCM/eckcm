-- Per-passenger airport ride notes.
-- Append-only log keyed by (ride_id, person_id). Used by airport staff
-- (SUPER_ADMIN, EVENT_ADMIN, AIRPORT_SHUTTLE_DRIVER) to record changes,
-- no-shows, flight delays, manual swaps, etc.

CREATE TABLE IF NOT EXISTS eckcm_airport_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id     uuid NOT NULL REFERENCES eckcm_airport_rides(id) ON DELETE CASCADE,
  person_id   uuid NOT NULL REFERENCES eckcm_people(id)        ON DELETE CASCADE,
  body        text NOT NULL CHECK (length(btrim(body)) > 0),
  author_id   uuid REFERENCES eckcm_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eckcm_airport_notes_ride_person_idx
  ON eckcm_airport_notes(ride_id, person_id, created_at DESC);

CREATE INDEX IF NOT EXISTS eckcm_airport_notes_author_idx
  ON eckcm_airport_notes(author_id);

-- updated_at trigger (reuse existing function)
DROP TRIGGER IF EXISTS eckcm_airport_notes_set_updated_at ON eckcm_airport_notes;
CREATE TRIGGER eckcm_airport_notes_set_updated_at
  BEFORE UPDATE ON eckcm_airport_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE eckcm_airport_notes ENABLE ROW LEVEL SECURITY;

-- Read: any airport staff (super admin, event admin, shuttle driver)
DROP POLICY IF EXISTS "Airport staff read notes" ON eckcm_airport_notes;
CREATE POLICY "Airport staff read notes"
  ON eckcm_airport_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM eckcm_staff_assignments sa
      JOIN eckcm_roles r ON r.id = sa.role_id
      WHERE sa.user_id = auth.uid()
        AND sa.is_active = true
        AND r.name = ANY (ARRAY[
          'SUPER_ADMIN'::eckcm_staff_role,
          'EVENT_ADMIN'::eckcm_staff_role,
          'AIRPORT_SHUTTLE_DRIVER'::eckcm_staff_role
        ])
    )
  );

-- Insert: same staff, author_id must be self
DROP POLICY IF EXISTS "Airport staff insert notes" ON eckcm_airport_notes;
CREATE POLICY "Airport staff insert notes"
  ON eckcm_airport_notes
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM eckcm_staff_assignments sa
      JOIN eckcm_roles r ON r.id = sa.role_id
      WHERE sa.user_id = auth.uid()
        AND sa.is_active = true
        AND r.name = ANY (ARRAY[
          'SUPER_ADMIN'::eckcm_staff_role,
          'EVENT_ADMIN'::eckcm_staff_role,
          'AIRPORT_SHUTTLE_DRIVER'::eckcm_staff_role
        ])
    )
  );

-- Update: author only (and author_id must remain self)
DROP POLICY IF EXISTS "Author updates own note" ON eckcm_airport_notes;
CREATE POLICY "Author updates own note"
  ON eckcm_airport_notes
  FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Delete: author OR super admin
DROP POLICY IF EXISTS "Author or super admin deletes note" ON eckcm_airport_notes;
CREATE POLICY "Author or super admin deletes note"
  ON eckcm_airport_notes
  FOR DELETE
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM eckcm_staff_assignments sa
      JOIN eckcm_roles r ON r.id = sa.role_id
      WHERE sa.user_id = auth.uid()
        AND sa.is_active = true
        AND r.name = 'SUPER_ADMIN'::eckcm_staff_role
    )
  );
