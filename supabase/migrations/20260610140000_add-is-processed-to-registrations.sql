-- Admin-only "processed" marker for registrations. Purely a manual housekeeping
-- flag an admin can tick to note "this registration has been handled / is clean".
-- It does NOT affect row styling, counts, payment, or any business logic — it is
-- a global (shared across admins) checkbox in the Registrations table's Actions
-- column, mirroring is_highlighted. Defaults to false; existing rows need no
-- backfill.
ALTER TABLE eckcm_registrations
  ADD COLUMN IF NOT EXISTS is_processed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN eckcm_registrations.is_processed IS
  'Admin manual housekeeping flag: registration has been processed/handled. Global (shared). No effect on styling or business logic.';
