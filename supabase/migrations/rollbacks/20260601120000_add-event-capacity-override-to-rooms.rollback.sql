-- Rollback for 20260601120000_add-event-capacity-override-to-rooms.sql
ALTER TABLE eckcm_rooms
  DROP COLUMN IF EXISTS event_capacity_override;
