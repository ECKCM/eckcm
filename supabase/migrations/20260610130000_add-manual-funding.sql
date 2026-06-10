-- Custom ("manual") funding entries for the admin Funding Tracker.
--
-- Distinct from eckcm_funding_allocations (which are auto-derived per
-- registration from FUNDING fee categories): this table holds one-off funding
-- amounts an admin records by hand to track later — a name, an amount, and an
-- optional sponsor/note. Kept separate so it never interferes with the
-- status-filtered per-registration allocation counts.
CREATE TABLE IF NOT EXISTS eckcm_manual_funding (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Optional event scope (NULL = not tied to a specific event). The Funding
  -- Tracker is global today; the column lets entries be filtered by event later.
  event_id      uuid REFERENCES eckcm_events(id) ON DELETE SET NULL,
  name          text NOT NULL,
  amount_cents  integer NOT NULL CHECK (amount_cents > 0),
  sponsor_name  text,
  note          text,
  recorded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_funding_event ON eckcm_manual_funding(event_id);
CREATE INDEX IF NOT EXISTS idx_manual_funding_created ON eckcm_manual_funding(created_at DESC);

-- Admin-only table: all reads/writes go through the service-role API
-- (createAdminClient), matching eckcm_manual_payments. Enable RLS with no
-- public policies so the anon/auth keys cannot touch it directly.
ALTER TABLE eckcm_manual_funding ENABLE ROW LEVEL SECURITY;
