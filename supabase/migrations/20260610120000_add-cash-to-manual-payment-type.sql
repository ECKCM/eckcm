-- Allow "cash" as a manual payment type alongside "zelle" and "check".
-- eckcm_manual_payments.payment_type is a text column guarded by a CHECK
-- constraint (the table predates tracked migrations and uses text + CHECK,
-- not a PG enum). Drop and recreate the constraint to add 'cash'.
--
-- Idempotent: DROP ... IF EXISTS is a no-op if the constraint was never
-- created under that name; the recreated constraint then enforces the set.
ALTER TABLE eckcm_manual_payments
  DROP CONSTRAINT IF EXISTS eckcm_manual_payments_payment_type_check;

ALTER TABLE eckcm_manual_payments
  ADD CONSTRAINT eckcm_manual_payments_payment_type_check
  CHECK (payment_type = ANY (ARRAY['zelle'::text, 'check'::text, 'cash'::text]));
