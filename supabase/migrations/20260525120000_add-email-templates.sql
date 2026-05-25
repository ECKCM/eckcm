-- Reusable email templates for the admin announcement composer.
-- Shared across admins: SUPER_ADMIN and EVENT_ADMIN can list/use/edit/delete
-- any template. department_ids is an optional filter persisted with the
-- template (empty array = send to all).

CREATE TABLE IF NOT EXISTS eckcm_email_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  subject         text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 200),
  body_html       text NOT NULL CHECK (length(btrim(body_html)) > 0),
  department_ids  uuid[] NOT NULL DEFAULT '{}',
  created_by      uuid REFERENCES eckcm_users(id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES eckcm_users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Unique template names (case-insensitive) so the picker is unambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS eckcm_email_templates_name_lower_uniq
  ON eckcm_email_templates (lower(name));

CREATE INDEX IF NOT EXISTS eckcm_email_templates_updated_at_idx
  ON eckcm_email_templates (updated_at DESC);

-- updated_at trigger (reuses the shared update_updated_at function).
DROP TRIGGER IF EXISTS eckcm_email_templates_set_updated_at ON eckcm_email_templates;
CREATE TRIGGER eckcm_email_templates_set_updated_at
  BEFORE UPDATE ON eckcm_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE eckcm_email_templates ENABLE ROW LEVEL SECURITY;

-- All admins (super or event) can read / create / update / delete templates.
DROP POLICY IF EXISTS "Admins read email templates" ON eckcm_email_templates;
CREATE POLICY "Admins read email templates"
  ON eckcm_email_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM eckcm_staff_assignments sa
      JOIN eckcm_roles r ON r.id = sa.role_id
      WHERE sa.user_id = auth.uid()
        AND sa.is_active = true
        AND r.name IN (
          'SUPER_ADMIN'::eckcm_staff_role,
          'EVENT_ADMIN'::eckcm_staff_role
        )
    )
  );

DROP POLICY IF EXISTS "Admins insert email templates" ON eckcm_email_templates;
CREATE POLICY "Admins insert email templates"
  ON eckcm_email_templates
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM eckcm_staff_assignments sa
      JOIN eckcm_roles r ON r.id = sa.role_id
      WHERE sa.user_id = auth.uid()
        AND sa.is_active = true
        AND r.name IN (
          'SUPER_ADMIN'::eckcm_staff_role,
          'EVENT_ADMIN'::eckcm_staff_role
        )
    )
  );

DROP POLICY IF EXISTS "Admins update email templates" ON eckcm_email_templates;
CREATE POLICY "Admins update email templates"
  ON eckcm_email_templates
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM eckcm_staff_assignments sa
      JOIN eckcm_roles r ON r.id = sa.role_id
      WHERE sa.user_id = auth.uid()
        AND sa.is_active = true
        AND r.name IN (
          'SUPER_ADMIN'::eckcm_staff_role,
          'EVENT_ADMIN'::eckcm_staff_role
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM eckcm_staff_assignments sa
      JOIN eckcm_roles r ON r.id = sa.role_id
      WHERE sa.user_id = auth.uid()
        AND sa.is_active = true
        AND r.name IN (
          'SUPER_ADMIN'::eckcm_staff_role,
          'EVENT_ADMIN'::eckcm_staff_role
        )
    )
  );

DROP POLICY IF EXISTS "Admins delete email templates" ON eckcm_email_templates;
CREATE POLICY "Admins delete email templates"
  ON eckcm_email_templates
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM eckcm_staff_assignments sa
      JOIN eckcm_roles r ON r.id = sa.role_id
      WHERE sa.user_id = auth.uid()
        AND sa.is_active = true
        AND r.name IN (
          'SUPER_ADMIN'::eckcm_staff_role,
          'EVENT_ADMIN'::eckcm_staff_role
        )
    )
  );
