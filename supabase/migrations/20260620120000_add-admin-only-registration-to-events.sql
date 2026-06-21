-- Per-event "staff-only registration" toggle. When ON, the public registration
-- wizard and submit APIs are locked: only SUPER_ADMIN and EVENT_ADMIN can
-- register for this event. This is independent of is_active (which hides the
-- event entirely) and is meant for staging / test windows where staff want to
-- dry-run the flow against a live event before opening it to everyone.
ALTER TABLE eckcm_events
  ADD COLUMN IF NOT EXISTS admin_only_registration boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN eckcm_events.admin_only_registration IS
  'When true, public registration is blocked; only SUPER_ADMIN and EVENT_ADMIN can register. Independent of is_active.';
