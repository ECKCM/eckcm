-- Department-scoped admin roles
-- Adds:
--   1. Enum value 'DEPARTMENT_ADMIN' on eckcm_staff_role
--   2. department_id column on eckcm_roles (links a role row to a department)
--   3. Replaces the global UNIQUE(name) constraint with a composite
--      uniqueness so multiple DEPARTMENT_ADMIN rows can coexist, one per dept
--   4. Permission code 'department.view'
--
-- The actual role rows (one per existing department) are inserted in the
-- follow-up file 20260514120100_seed-department-admin-role.sql which runs
-- in its own transaction so the new enum value is committed first.

-- 1. Enum value (must be its own statement and committed before any DML
--    references it).
ALTER TYPE eckcm_staff_role ADD VALUE IF NOT EXISTS 'DEPARTMENT_ADMIN';

-- 2. department_id on eckcm_roles
ALTER TABLE eckcm_roles
  ADD COLUMN IF NOT EXISTS department_id uuid
    REFERENCES eckcm_departments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS eckcm_roles_department_id_idx
  ON eckcm_roles(department_id);

-- 3. Drop old unique on name (if it exists) and add composite uniqueness.
--    A single (name, department_id) pair must remain unique, but multiple
--    rows with the same name (e.g. DEPARTMENT_ADMIN) are allowed when each
--    references a different department.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.eckcm_roles'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ILIKE 'UNIQUE (name)';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE eckcm_roles DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS eckcm_roles_name_department_uniq
  ON eckcm_roles(
    name,
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- 4. Permission row
INSERT INTO eckcm_permissions (code, description_en, description_ko, category)
VALUES (
  'department.view',
  'View participants in assigned department',
  '담당 부서의 참가자 보기',
  'department'
)
ON CONFLICT (code) DO NOTHING;
