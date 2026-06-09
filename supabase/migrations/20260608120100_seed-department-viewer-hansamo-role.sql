-- Seed the DEPARTMENT_VIEWER_HANSAMO role row. Runs in its own transaction so
-- the enum value added in 20260608120000 is committed and usable here.
--
-- Not department-scoped (department_id IS NULL): "Hansamo" is a lodging cohort
-- (eckcm_groups.lodging_type = LODGING_WILLOW_HANSAMO), not an eckcm_departments
-- row. The role grants no permissions — its access is the willow route scope
-- hardcoded in middleware.

INSERT INTO eckcm_roles (name, description_en, description_ko, is_system, department_id)
VALUES (
  'DEPARTMENT_VIEWER_HANSAMO'::eckcm_staff_role,
  'Willow Hall viewer (Hansamo only)',
  'Willow Hall 뷰어 (한사모 전용)',
  true,
  NULL
)
ON CONFLICT (name, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO UPDATE
  SET description_en = EXCLUDED.description_en,
      description_ko = EXCLUDED.description_ko,
      is_system = true;
