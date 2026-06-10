-- Rollback: revert eckcm_manual_payments.payment_type to {zelle, check}.
-- NOTE: this will FAIL if any rows already use payment_type = 'cash'.
-- Reassign or delete those rows first.
ALTER TABLE eckcm_manual_payments
  DROP CONSTRAINT IF EXISTS eckcm_manual_payments_payment_type_check;

ALTER TABLE eckcm_manual_payments
  ADD CONSTRAINT eckcm_manual_payments_payment_type_check
  CHECK (payment_type = ANY (ARRAY['zelle'::text, 'check'::text]));
