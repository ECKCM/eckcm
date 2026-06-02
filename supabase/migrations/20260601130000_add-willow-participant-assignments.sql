-- Willow Hall participant-level room assignments.
--
-- Willow Hall (LODGING_WILLOW_EM / LODGING_WILLOW_HANSAMO) is a special case:
-- unlike every other building, rooms are NOT assigned to a whole registration
-- group. Individual participants are placed one at a time, 0–2 per room, and
-- EM + Hansamo share the same room pool. The order of placement matters because
-- the UPJ export shows only the FIRST-assigned person per room.
--
-- The unit of assignment is a `eckcm_group_memberships` row (one person's
-- participation in a registration), which carries the person, their group's
-- lodging_type, and their per-participant stay dates.

CREATE TABLE IF NOT EXISTS eckcm_willow_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES eckcm_events(id) ON DELETE CASCADE,
  room_id       uuid NOT NULL REFERENCES eckcm_rooms(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES eckcm_group_memberships(id) ON DELETE CASCADE,
  assigned_by   uuid,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- A participant occupies at most one Willow room.
  CONSTRAINT eckcm_willow_assignments_membership_unique UNIQUE (membership_id)
);

CREATE INDEX IF NOT EXISTS idx_willow_assignments_room ON eckcm_willow_assignments (room_id);
CREATE INDEX IF NOT EXISTS idx_willow_assignments_event ON eckcm_willow_assignments (event_id);
-- "earliest-assigned person per room" lookups for the UPJ export.
CREATE INDEX IF NOT EXISTS idx_willow_assignments_room_order
  ON eckcm_willow_assignments (room_id, assigned_at);

-- Hard-cap occupancy at the room's own capacity (Willow rooms are capacity 2),
-- so concurrent assignments can never overfill a room.
CREATE OR REPLACE FUNCTION eckcm_willow_room_capacity_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cap int;
  occupied int;
BEGIN
  SELECT capacity INTO cap FROM eckcm_rooms WHERE id = NEW.room_id;
  SELECT count(*) INTO occupied
    FROM eckcm_willow_assignments
    WHERE room_id = NEW.room_id
      AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF occupied >= COALESCE(cap, 2) THEN
    RAISE EXCEPTION 'Willow room is already full (capacity %)', COALESCE(cap, 2)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_willow_room_capacity_guard ON eckcm_willow_assignments;
CREATE TRIGGER trg_willow_room_capacity_guard
  BEFORE INSERT OR UPDATE OF room_id ON eckcm_willow_assignments
  FOR EACH ROW EXECUTE FUNCTION eckcm_willow_room_capacity_guard();

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION eckcm_willow_assignments_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_willow_assignments_touch ON eckcm_willow_assignments;
CREATE TRIGGER trg_willow_assignments_touch
  BEFORE UPDATE ON eckcm_willow_assignments
  FOR EACH ROW EXECUTE FUNCTION eckcm_willow_assignments_touch();

-- ─── RLS (mirrors eckcm_room_assignments) ───────────────────────
ALTER TABLE eckcm_willow_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY willow_assignments_select_authenticated
  ON eckcm_willow_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY willow_assignments_realtime_staff_read
  ON eckcm_willow_assignments FOR SELECT TO public
  USING (is_active_staff(auth.uid()));

CREATE POLICY willow_assignments_insert_admin
  ON eckcm_willow_assignments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM eckcm_staff_assignments sa
    JOIN eckcm_roles r ON r.id = sa.role_id
    WHERE sa.user_id = auth.uid() AND sa.is_active = true
      AND r.name = ANY (ARRAY['SUPER_ADMIN'::eckcm_staff_role, 'EVENT_ADMIN'::eckcm_staff_role])
  ));

CREATE POLICY willow_assignments_update_admin
  ON eckcm_willow_assignments FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM eckcm_staff_assignments sa
    JOIN eckcm_roles r ON r.id = sa.role_id
    WHERE sa.user_id = auth.uid() AND sa.is_active = true
      AND r.name = ANY (ARRAY['SUPER_ADMIN'::eckcm_staff_role, 'EVENT_ADMIN'::eckcm_staff_role])
  ));

CREATE POLICY willow_assignments_delete_admin
  ON eckcm_willow_assignments FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM eckcm_staff_assignments sa
    JOIN eckcm_roles r ON r.id = sa.role_id
    WHERE sa.user_id = auth.uid() AND sa.is_active = true
      AND r.name = ANY (ARRAY['SUPER_ADMIN'::eckcm_staff_role, 'EVENT_ADMIN'::eckcm_staff_role])
  ));

-- Realtime so the assignment board updates live across admins.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'eckcm_willow_assignments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE eckcm_willow_assignments';
  END IF;
END;
$$;

COMMENT ON TABLE eckcm_willow_assignments IS
  'Participant-level room assignments for Willow Hall (special case). One row = one person (group_membership) placed in a Willow room, 0–2 per room. The earliest assigned_at per room is the person shown in the UPJ export.';
