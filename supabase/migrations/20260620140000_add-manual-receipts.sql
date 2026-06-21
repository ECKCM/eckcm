-- Hand-written ("manual") receipts for the admin Print → Manual Receipts page.
--
-- An admin builds a receipt by hand (or imports a snapshot from an existing
-- registration) and prints it. Each saved receipt is one immutable record of
-- what was printed: recipient, line items, totals, and an optional link back to
-- the registration it was derived from.
--
-- Deliberately separate from eckcm_invoices / eckcm_payments: a manual receipt
-- is a printable document, NOT a billing record. It must never touch the
-- money flow (Stripe PIs, settlement, refund-fee math, the ≤1-outstanding-
-- invoice invariant). "Import from registration" copies a SNAPSHOT of that
-- registration's line items into this table — it never mutates the source
-- invoice. Matches the admin-only pattern of eckcm_manual_funding /
-- eckcm_manual_payments.
CREATE TABLE IF NOT EXISTS eckcm_manual_receipts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Human-readable receipt number, unique. Auto-assigned MR-YYYY-NNNN on
  -- create (NNNN from receipt_seq), but admin-editable so a custom number can
  -- be set when reprinting an external document.
  receipt_number    text NOT NULL UNIQUE,
  -- Monotonic per-table sequence backing the default NNNN. Filled server-side.
  receipt_seq       integer NOT NULL,

  -- Optional event scope (NULL = not tied to a specific event).
  event_id          uuid REFERENCES eckcm_events(id) ON DELETE SET NULL,
  -- Optional provenance: the registration this receipt was imported/derived
  -- from. SET NULL on delete — the receipt is a standalone printed document and
  -- must survive its source registration being removed.
  registration_id   uuid REFERENCES eckcm_registrations(id) ON DELETE SET NULL,

  -- Recipient / header fields shown on the printed receipt.
  recipient_name    text NOT NULL DEFAULT '',
  recipient_detail  text,                 -- church / address / email — free text
  -- Date printed on the receipt (US Eastern date the admin picks); defaults to
  -- today. Stored as a date, not a timestamp, since it's a document date.
  receipt_date      date NOT NULL DEFAULT (now() AT TIME ZONE 'America/New_York')::date,

  -- Line items as JSON: [{ description, quantity, unitPriceCents, amountCents }].
  -- amount_cents below is the authoritative printed total (admin can override
  -- it independently of the line-item sum if needed).
  line_items        jsonb NOT NULL DEFAULT '[]'::jsonb,
  amount_cents      integer NOT NULL DEFAULT 0,
  -- Optional payment-method label and free-text memo/note shown on the receipt.
  payment_method    text,
  memo              text,

  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_receipts_event ON eckcm_manual_receipts(event_id);
CREATE INDEX IF NOT EXISTS idx_manual_receipts_registration ON eckcm_manual_receipts(registration_id);
CREATE INDEX IF NOT EXISTS idx_manual_receipts_created ON eckcm_manual_receipts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_manual_receipts_seq ON eckcm_manual_receipts(receipt_seq DESC);

-- Admin-only table: all reads/writes go through the service-role API
-- (createAdminClient). Enable RLS with no public policies so the anon/auth
-- keys cannot touch it directly.
ALTER TABLE eckcm_manual_receipts ENABLE ROW LEVEL SECURITY;
