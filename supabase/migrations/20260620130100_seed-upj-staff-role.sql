-- Seed the UPJ_STAFF role row. Runs in its own transaction so the enum value
-- added in 20260620130000 is committed and usable here.
--
-- Not department-scoped (department_id IS NULL): UPJ staff are external lodging
-- partners, not an eckcm_departments row. The role grants no permissions — its
-- access is the /upj-staff and check-in route scope hardcoded in middleware.

INSERT INTO eckcm_roles (name, description_en, description_ko, is_system, department_id)
VALUES (
  'UPJ_STAFF'::eckcm_staff_role,
  'UPJ Staff (meal check-in, scan sessions, UPJ lodging)',
  'UPJ 스태프 (식사 체크인, 스캔 세션, UPJ 숙소)',
  true,
  NULL
)
ON CONFLICT (name, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO UPDATE
  SET description_en = EXCLUDED.description_en,
      description_ko = EXCLUDED.description_ko,
      is_system = true;
