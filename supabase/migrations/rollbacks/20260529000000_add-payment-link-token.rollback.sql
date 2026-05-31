-- Rollback for: 20260529000000_add-payment-link-token.sql
-- Feature: submitted-card-payment-link
-- Reverses the additive token columns + partial unique index on eckcm_registrations.

DROP INDEX IF EXISTS public.eckcm_registrations_payment_link_token_hash_key;

ALTER TABLE public.eckcm_registrations
  DROP COLUMN IF EXISTS payment_link_expires_at,
  DROP COLUMN IF EXISTS payment_link_created_at,
  DROP COLUMN IF EXISTS payment_link_token_hash,
  DROP COLUMN IF EXISTS payment_link_token;
