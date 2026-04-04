-- Add refunded_cents column to track partial/full refund amounts
ALTER TABLE eckcm_manual_payments
  ADD COLUMN IF NOT EXISTS refunded_cents integer NOT NULL DEFAULT 0;

-- Add check constraint: refunded amount cannot exceed payment amount
ALTER TABLE eckcm_manual_payments
  ADD CONSTRAINT chk_refunded_not_exceeding
  CHECK (refunded_cents >= 0 AND refunded_cents <= amount_cents);

-- Expand status check to include partially_refunded
ALTER TABLE eckcm_manual_payments DROP CONSTRAINT IF EXISTS eckcm_manual_payments_status_check;
ALTER TABLE eckcm_manual_payments
  ADD CONSTRAINT eckcm_manual_payments_status_check
  CHECK (status = ANY (ARRAY['received'::text, 'updated'::text, 'refunded'::text, 'partially_refunded'::text]));
