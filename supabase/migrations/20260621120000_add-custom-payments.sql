-- Custom payments: a public page where anyone can pay an arbitrary (custom)
-- amount via Stripe card. Each payment attempt is recorded as its own row
-- (one row per payment), mirroring the eckcm_donations model but generic /
-- not tied to a department or fund.

create table if not exists public.eckcm_custom_payments (
  id                       uuid primary key default gen_random_uuid(),
  payer_name               text,
  payer_email              text,
  purpose                  text,                                   -- optional memo: what the payment is for
  amount_cents             integer not null check (amount_cents > 0),
  fee_cents                integer not null default 0,
  covers_fees              boolean not null default false,
  stripe_payment_intent_id text,
  payment_method           public.eckcm_payment_method not null default 'CARD',
  status                   public.eckcm_payment_status not null default 'PENDING',
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_eckcm_custom_payments_stripe_pi
  on public.eckcm_custom_payments (stripe_payment_intent_id);

create index if not exists idx_eckcm_custom_payments_status
  on public.eckcm_custom_payments (status);

create index if not exists idx_eckcm_custom_payments_created_at
  on public.eckcm_custom_payments (created_at desc);

-- Service-role (admin client) access only, same as eckcm_donations.
-- RLS is enabled with no public/authenticated policies so the anon key
-- cannot read or write rows directly.
alter table public.eckcm_custom_payments enable row level security;
