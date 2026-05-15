-- Seed one DEPARTMENT_ADMIN role per active department, each granted the
-- department.view permission. Runs in its own transaction so the enum value
-- added in the previous migration is available.

INSERT INTO eckcm_roles (name, description_en, description_ko, is_system, department_id)
SELECT
  'DEPARTMENT_ADMIN'::eckcm_staff_role,
  d.name_en || ' Department Viewer',
  COALESCE(d.name_ko, d.name_en) || ' 부서 뷰어',
  true,
  d.id
FROM eckcm_departments d
WHERE d.is_active = true
ON CONFLICT (name, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO UPDATE
  SET description_en = EXCLUDED.description_en,
      description_ko = EXCLUDED.description_ko,
      is_system = true;

-- Grant department.view to every dept-scoped DEPARTMENT_ADMIN role
INSERT INTO eckcm_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM eckcm_roles r
CROSS JOIN eckcm_permissions p
WHERE r.name = 'DEPARTMENT_ADMIN'
  AND r.department_id IS NOT NULL
  AND p.code = 'department.view'
ON CONFLICT DO NOTHING;
