-- Rollback for department-scoped admin roles.
-- NOTE: Postgres does not support removing values from an enum, so the
-- 'DEPARTMENT_ADMIN' enum value remains. Everything else is reversible.

DELETE FROM eckcm_role_permissions
WHERE role_id IN (
  SELECT id FROM eckcm_roles
  WHERE name = 'DEPARTMENT_ADMIN' AND department_id IS NOT NULL
);

DELETE FROM eckcm_roles
WHERE name = 'DEPARTMENT_ADMIN' AND department_id IS NOT NULL;

DELETE FROM eckcm_permissions WHERE code = 'department.view';

DROP INDEX IF EXISTS eckcm_roles_name_department_uniq;
DROP INDEX IF EXISTS eckcm_roles_department_id_idx;

ALTER TABLE eckcm_roles DROP COLUMN IF EXISTS department_id;

-- Best-effort restore of the prior single-column unique on name. If
-- duplicates exist this will fail and need manual cleanup first.
ALTER TABLE eckcm_roles ADD CONSTRAINT eckcm_roles_name_key UNIQUE (name);
