-- Enable RLS on eckcm_scan_sessions and mirror the eckcm_checkins policy
-- pattern. The app writes via the service-role admin client (bypasses RLS),
-- but we still want defense-in-depth + a SELECT policy so Supabase Realtime
-- can authorize subscribers using the user's JWT.

ALTER TABLE eckcm_scan_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY scan_sessions_read
  ON eckcm_scan_sessions
  FOR SELECT
  USING (is_active_staff((SELECT auth.uid())));

CREATE POLICY scan_sessions_insert
  ON eckcm_scan_sessions
  FOR INSERT
  WITH CHECK (has_event_permission((SELECT auth.uid()), event_id, 'checkin.manage'));

CREATE POLICY scan_sessions_update
  ON eckcm_scan_sessions
  FOR UPDATE
  USING (has_event_permission((SELECT auth.uid()), event_id, 'checkin.manage'))
  WITH CHECK (has_event_permission((SELECT auth.uid()), event_id, 'checkin.manage'));

CREATE POLICY scan_sessions_delete
  ON eckcm_scan_sessions
  FOR DELETE
  USING (is_super_admin((SELECT auth.uid())));
