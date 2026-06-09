-- Bind the DEPARTMENT_VIEWER_HANSAMO role to the HANSAMO department.
--
-- The role was originally seeded with department_id = NULL (it was Willow-only
-- and access was purely the hardcoded willow route scope in middleware). We now
-- also expose the standard Department View page to this role. Department View is
-- department-scoped: the middleware forwards role.department_id as a
-- x-user-department-ids entry, and the department-view pages filter to it.
--
-- Pointing this role at the existing HANSAMO department (short_code = 'HANSAMO')
-- makes Department View show the Hansamo roster. The Willow Hall page is
-- unaffected: its Hansamo filter keys off the role name + group.lodging_type
-- (LODGING_WILLOW_HANSAMO), not the department.
--
-- Resolved by short_code (stable) rather than a hardcoded UUID. Idempotent.

UPDATE eckcm_roles r
SET department_id = d.id
FROM eckcm_departments d
WHERE r.name = 'DEPARTMENT_VIEWER_HANSAMO'::eckcm_staff_role
  AND r.department_id IS DISTINCT FROM d.id
  AND d.short_code = 'HANSAMO';
