-- Department Viewer (Hansamo) — single-page admin role.
--
-- A staff member with this role (and no broader admin role) is scoped, in
-- middleware, to /admin/lodging/willow only, with the participant pool locked
-- to the Hansamo cohort. This mirrors the AIRPORT_SHUTTLE_DRIVER pattern:
-- access is enforced by the hardcoded route scope in src/lib/supabase/middleware.ts,
-- NOT by table-driven permissions — so this role intentionally grants no
-- permission codes.
--
-- This file only adds the enum value. The role row is inserted in the
-- follow-up file 20260608120100_seed-department-viewer-hansamo-role.sql, which
-- runs in its own transaction so the new enum value is committed first
-- (Postgres forbids using a freshly-added enum value within the same txn).

ALTER TYPE eckcm_staff_role ADD VALUE IF NOT EXISTS 'DEPARTMENT_VIEWER_HANSAMO';
