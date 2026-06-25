-- Standalone / disposable meal passes.
--
-- Unlike participant meal check-ins (eckcm_checkins, keyed to a registered
-- person), a meal pass is an anonymous, registration-free QR that grants N
-- generic meal redemptions (any meal, any day). Two sources create them:
--   1. The public /mealpay page — a buyer purchases N meals (card or on-site).
--   2. The admin bulk-print page — free single-use comp tokens handed out.
--
-- The QR encodes a random token as a /m/{token} URL; lookups always hit
-- token_hash (never the raw token), mirroring the e-pass security model.
-- Service-role (admin client) access only: RLS on, no policies.

create table if not exists public.eckcm_meal_passes (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid references public.eckcm_events(id) on delete set null,
  -- QR token (unguessable). token = what the /m/{token} URL carries;
  -- token_hash = sha256(token), the only thing we query by.
  token              text not null,
  token_hash         text not null,
  -- Buyer identity (optional; comp passes have none).
  payer_name         text,
  payer_email        text,
  -- Pricing tier: a MEAL_* fee-category code (e.g. 'MEAL_GENERAL' | 'MEAL_YOUTH').
  -- null for comp passes (no price).
  tier_code          text,
  -- Usage accounting. N generic uses — every redemption bumps uses_consumed.
  uses_total         integer not null check (uses_total >= 0),
  uses_consumed      integer not null default 0 check (uses_consumed >= 0),
  -- Payment linkage. Paid passes reuse eckcm_custom_payments (one row per
  -- purchase); comp / free passes have no payment row.
  custom_payment_id  uuid references public.eckcm_custom_payments(id) on delete set null,
  amount_cents       integer not null default 0,
  -- 'PURCHASED' (/mealpay) | 'COMP' (bulk-print free single-use)
  pass_kind          text not null default 'PURCHASED'
    constraint eckcm_meal_passes_kind_check
      check (pass_kind in ('PURCHASED', 'COMP')),
  -- Lifecycle:
  --   PENDING   — card purchase awaiting Stripe success (QR not yet servable)
  --   SUBMITTED — on-site (cash/check/zelle) unpaid walk-in; QR servable now
  --   ACTIVE    — paid card purchase OR comp; QR servable
  --   USED_UP   — uses_consumed reached uses_total
  --   VOID      — admin-invalidated / refunded
  status             text not null default 'PENDING'
    constraint eckcm_meal_passes_status_check
      check (status in ('PENDING', 'SUBMITTED', 'ACTIVE', 'USED_UP', 'VOID')),
  -- Groups one bulk-print run together (null for /mealpay purchases).
  batch_id           uuid,
  -- Admin who generated a comp batch (null for public purchases).
  created_by_user_id uuid references auth.users(id) on delete set null,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint eckcm_meal_passes_uses_check check (uses_consumed <= uses_total)
);

-- All redemption lookups go through the hash; also enforces token uniqueness.
create unique index if not exists idx_eckcm_meal_passes_token_hash
  on public.eckcm_meal_passes (token_hash);

create index if not exists idx_eckcm_meal_passes_status
  on public.eckcm_meal_passes (status);

create index if not exists idx_eckcm_meal_passes_batch
  on public.eckcm_meal_passes (batch_id)
  where batch_id is not null;

create index if not exists idx_eckcm_meal_passes_custom_payment
  on public.eckcm_meal_passes (custom_payment_id)
  where custom_payment_id is not null;

alter table public.eckcm_meal_passes enable row level security;

-- ---------------------------------------------------------------------------
-- Redemption ledger. One row per scan of a meal pass at the food line. Kept
-- SEPARATE from eckcm_checkins because that table's person_id (a registered
-- participant) is non-null across every verify path, unique index, realtime
-- payload, and count query — a registration-free pass has no person_id, so
-- folding it in would force changes to all of those. This table is the audit
-- trail; the over-redemption guard itself is an atomic guarded UPDATE on
-- eckcm_meal_passes.uses_consumed (generic N-use passes have no per-meal
-- uniqueness — the same pass may legitimately be used for three dinners).
create table if not exists public.eckcm_meal_pass_redemptions (
  id              uuid primary key default gen_random_uuid(),
  meal_pass_id    uuid not null references public.eckcm_meal_passes(id) on delete cascade,
  event_id        uuid references public.eckcm_events(id) on delete set null,
  meal_date       date not null,
  meal_type       text not null
    constraint eckcm_meal_pass_redemptions_meal_type_check
      check (meal_type in ('BREAKFAST', 'LUNCH', 'DINNER')),
  scan_session_id uuid references public.eckcm_scan_sessions(id) on delete set null,
  redeemed_by     uuid not null references auth.users(id),
  is_sandbox      boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_eckcm_meal_pass_redemptions_pass
  on public.eckcm_meal_pass_redemptions (meal_pass_id);

create index if not exists idx_eckcm_meal_pass_redemptions_event_date
  on public.eckcm_meal_pass_redemptions (event_id, meal_date);

alter table public.eckcm_meal_pass_redemptions enable row level security;
