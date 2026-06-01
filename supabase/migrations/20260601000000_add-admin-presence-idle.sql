-- Idle/away presence for the admin header "admins online" list.
--
-- `last_seen_at` is the heartbeat that proves an admin's tab is still open
-- (updated every 30s regardless of activity). We add `last_active_at` to track
-- the admin's last *real* interaction (mouse/keyboard/touch). When the gap
-- between now() and last_active_at exceeds the idle threshold, the admin is
-- still "online" but shown as idle (yellow) instead of active (green).
--
-- Existing rows get now() via the default, so nobody flickers to idle on deploy.

ALTER TABLE eckcm_admin_presence
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN eckcm_admin_presence.last_active_at IS
  'Timestamp of the admin''s last real interaction (mouse/keyboard/touch). Distinct from last_seen_at (the 30s heartbeat). When now() - last_active_at exceeds the idle threshold the admin is rendered as idle (yellow) in the presence list.';
