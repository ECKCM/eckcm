-- Participant transfer tracking (clone model).
--
-- Transferring a participant to another registration used to MOVE the group
-- membership row (update group_id), which made the person vanish from the
-- source registration — losing the link to the original payment and, when it
-- was the only member, leaving an empty-shell registration.
--
-- New model: the participant is CLONED into the target group (a fresh active
-- membership with a new participant_code) and the original membership is
-- removed, but a tracking row is recorded here first. This keeps every
-- existing active-participant query (billing, check-in, e-pass, exports)
-- correct without per-call-site filtering, while preserving a record of who
-- was originally on the source registration so the original payment can be
-- reconciled.

CREATE TABLE IF NOT EXISTS eckcm_participant_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES eckcm_people(id) ON DELETE CASCADE,

  from_registration_id uuid NOT NULL REFERENCES eckcm_registrations(id) ON DELETE CASCADE,
  from_group_id uuid REFERENCES eckcm_groups(id) ON DELETE SET NULL,
  to_registration_id uuid NOT NULL REFERENCES eckcm_registrations(id) ON DELETE CASCADE,
  to_group_id uuid REFERENCES eckcm_groups(id) ON DELETE SET NULL,
  -- The cloned (active) membership in the target group. Null if later removed.
  to_membership_id uuid REFERENCES eckcm_group_memberships(id) ON DELETE SET NULL,

  -- Snapshot of the original membership (the source row is deleted on transfer)
  original_role text NOT NULL DEFAULT 'MEMBER',
  original_participant_code text,
  new_participant_code text,
  stay_start_date date,
  stay_end_date date,

  -- Denormalized name snapshot so the tracking row still renders even if the
  -- person record is later edited.
  person_first_name text,
  person_last_name text,
  person_display_name_ko text,

  transferred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  transferred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participant_transfers_from_reg
  ON eckcm_participant_transfers(from_registration_id);
CREATE INDEX IF NOT EXISTS idx_participant_transfers_to_reg
  ON eckcm_participant_transfers(to_registration_id);
CREATE INDEX IF NOT EXISTS idx_participant_transfers_to_membership
  ON eckcm_participant_transfers(to_membership_id);
CREATE INDEX IF NOT EXISTS idx_participant_transfers_person
  ON eckcm_participant_transfers(person_id);

-- Writes happen via the service-role admin client (bypasses RLS). Reads go
-- through the service-role admin API too, but add a staff SELECT policy for
-- defense-in-depth and direct/Realtime reads.
ALTER TABLE eckcm_participant_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS participant_transfers_read ON eckcm_participant_transfers;
CREATE POLICY participant_transfers_read
  ON eckcm_participant_transfers
  FOR SELECT
  USING (is_active_staff((SELECT auth.uid())));
