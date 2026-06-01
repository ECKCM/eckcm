-- Feature: donations (retroactive baseline)
-- Purpose: The eckcm_donations table has been live in production since the
--          donation feature shipped (commit 8f4caad, 2026-03-25) but was created
--          directly in the DB and never captured as a migration. This file makes
--          the schema reproducible from the repo.
--
-- Safety: FULLY IDEMPOTENT. On production (where the table already exists) every
--         statement is a no-op:
--           - CREATE TABLE IF NOT EXISTS         -> skipped
--           - CREATE INDEX IF NOT EXISTS         -> skipped
--           - ENABLE ROW LEVEL SECURITY          -> already enabled
--           - CREATE OR REPLACE TRIGGER          -> recreates identical trigger
--           - CREATE EXTENSION IF NOT EXISTS     -> already present
--         No data is touched. Mirrors the exact prod schema as of 2026-06-01.
--
-- Depends on: enum types public.eckcm_payment_method and public.eckcm_payment_status
--             (part of the base schema; assumed to exist, like every other
--             incremental migration in this repo).
--
-- Apply:    user runs `supabase db push` (Claude Code does not push).
-- Rollback: supabase/migrations/rollbacks/20260601120000_baseline-eckcm-donations.rollback.sql
--           (DESTRUCTIVE — drops the table; do NOT run on production.)

-- updated_at trigger helper (Supabase ships this in the `extensions` schema).
create extension if not exists moddatetime with schema extensions;

create table if not exists public.eckcm_donations (
  id                        uuid                      primary key default gen_random_uuid(),
  donor_name                text,
  donor_email               text,
  amount_cents              integer                   not null,
  fee_cents                 integer                   not null default 0,
  covers_fees               boolean                   not null default false,
  stripe_payment_intent_id  text,
  payment_method            public.eckcm_payment_method  not null default 'CARD',
  status                    public.eckcm_payment_status  not null default 'PENDING',
  metadata                  jsonb                     default '{}'::jsonb,
  created_at                timestamptz               not null default now(),
  updated_at                timestamptz               not null default now(),
  constraint eckcm_donations_amount_cents_check check (amount_cents > 0)
);

-- Log-safe, indexed lookup by Stripe PaymentIntent (webhook + sync paths).
create index if not exists idx_eckcm_donations_stripe_pi
  on public.eckcm_donations (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- Service-role only: RLS enabled with no policies. All access goes through the
-- admin (service-role) client, which bypasses RLS. No anon/authenticated policy
-- is intentional — donations are never read/written from the browser directly.
alter table public.eckcm_donations enable row level security;

-- Keep updated_at fresh on every UPDATE.
create or replace trigger set_eckcm_donations_updated_at
  before update on public.eckcm_donations
  for each row execute function extensions.moddatetime('updated_at');

comment on table public.eckcm_donations is
  'Standalone donations (not tied to a registration). Card donations go through Stripe; manual (Zelle/Check/Cash via ONSITE_* methods) are admin-recorded. Refunds are tracked in metadata, not eckcm_refunds.';
