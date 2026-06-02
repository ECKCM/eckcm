-- Per-room event-capacity override for the UPJ Lodging Rooms admin page.
--
-- The "Cap" column on /admin/lodging/upj-rooms normally shows EVENT capacity
-- derived from the room type (Double = 6, Single = 2, apartments = host capacity).
-- Admins sometimes need to override this for a specific room (e.g. a Double that
-- can only seat 4 for the event). This nullable column stores that override.
--
-- NULL = no override; the app falls back to the type-derived default. So existing
-- rooms keep their current behavior and nobody's capacity changes on deploy.

ALTER TABLE eckcm_rooms
  ADD COLUMN IF NOT EXISTS event_capacity_override integer;

COMMENT ON COLUMN eckcm_rooms.event_capacity_override IS
  'Admin-set override for the room''s EVENT capacity (max participants for the event), set inline on /admin/lodging/upj-rooms. NULL means use the type-derived default (Double=6, Single=2, apartments=host capacity). Distinct from the `capacity` column, which is the physical bed count.';
