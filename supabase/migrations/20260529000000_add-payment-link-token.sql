-- Feature: submitted-card-payment-link
-- Purpose: Let a SUBMITTED (Zelle/Check) registration pay by card via a secure,
--          login-free self-service link. Stores a per-registration random token.
--
-- Safety: ADDITIVE ONLY. New nullable columns + one partial unique index.
--         No existing column altered/dropped. No data backfill required
--         (all columns nullable; tokens are created on demand by the admin action).
--
-- Apply:    user runs `supabase db push` (Claude Code does not push).
-- Rollback: supabase/migrations/rollbacks/20260529000000_add-payment-link-token.rollback.sql

alter table public.eckcm_registrations
  add column if not exists payment_link_token       text,
  add column if not exists payment_link_token_hash  text,
  add column if not exists payment_link_created_at   timestamptz,
  add column if not exists payment_link_expires_at   timestamptz;

-- Indexed lookup by hash (raw token never appears in query/logs).
-- Partial: only enforce uniqueness for issued (non-null) tokens.
create unique index if not exists eckcm_registrations_payment_link_token_hash_key
  on public.eckcm_registrations (payment_link_token_hash)
  where payment_link_token_hash is not null;

comment on column public.eckcm_registrations.payment_link_token is
  'Raw self-service card-payment link token (kept for admin re-copy). Cleared after payment. See submitted-card-payment-link.design.md';
comment on column public.eckcm_registrations.payment_link_token_hash is
  'sha256(payment_link_token) — used for indexed, log-safe lookup on the public /pay/[token] route.';
comment on column public.eckcm_registrations.payment_link_expires_at is
  'Optional expiry for the payment link. NULL = no expiry.';
