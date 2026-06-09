-- Let DEPARTMENT_VIEWER_HANSAMO assign/unassign Willow participants — but only
-- Hansamo ones. Without these, the role can SELECT the board (so it renders) but
-- any INSERT fails with "new row violates row-level security policy" because the
-- existing write policies are SUPER_ADMIN / EVENT_ADMIN only.
--
-- Scope is enforced at the DB level (not just the UI): a row is "Hansamo" iff its
-- membership belongs to a group with lodging_type = 'LODGING_WILLOW_HANSAMO'. EM
-- rows (LODGING_WILLOW_EM) remain untouchable by this role even if the client is
-- bypassed — the Hansamo viewer can neither create nor delete an EM assignment.
--
-- No UPDATE policy: the willow board only ever inserts and deletes assignments.

-- Predicate: the current user holds an active DEPARTMENT_VIEWER_HANSAMO role.
-- Predicate: the given membership_id belongs to a Hansamo Willow group.
-- Both are inlined into each policy (RLS policies can't reference helper vars).

CREATE POLICY willow_assignments_insert_hansamo_viewer
  ON eckcm_willow_assignments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM eckcm_staff_assignments sa
      JOIN eckcm_roles r ON r.id = sa.role_id
      WHERE sa.user_id = auth.uid()
        AND sa.is_active = true
        AND r.name = 'DEPARTMENT_VIEWER_HANSAMO'::eckcm_staff_role
    )
    AND EXISTS (
      SELECT 1
      FROM eckcm_group_memberships m
      JOIN eckcm_groups g ON g.id = m.group_id
      WHERE m.id = eckcm_willow_assignments.membership_id
        AND g.lodging_type = 'LODGING_WILLOW_HANSAMO'
    )
  );

CREATE POLICY willow_assignments_delete_hansamo_viewer
  ON eckcm_willow_assignments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM eckcm_staff_assignments sa
      JOIN eckcm_roles r ON r.id = sa.role_id
      WHERE sa.user_id = auth.uid()
        AND sa.is_active = true
        AND r.name = 'DEPARTMENT_VIEWER_HANSAMO'::eckcm_staff_role
    )
    AND EXISTS (
      SELECT 1
      FROM eckcm_group_memberships m
      JOIN eckcm_groups g ON g.id = m.group_id
      WHERE m.id = eckcm_willow_assignments.membership_id
        AND g.lodging_type = 'LODGING_WILLOW_HANSAMO'
    )
  );
