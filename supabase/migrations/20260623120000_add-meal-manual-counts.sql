-- UPJ staff manual (hand-counter) meal headcounts, for reconciliation against
-- the system check-in counts on the Daily Meal Report. One row per
-- event+date+meal; absence = "not entered". Accessed only via the service-role
-- admin client (RLS on, no policies → denied to anon/authenticated).
--
-- Applied to production via Supabase MCP apply_migration (2026-06-23); this file
-- mirrors that DDL so the repo stays the source of truth.

create table if not exists eckcm_meal_manual_counts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references eckcm_events(id) on delete cascade,
  meal_date date not null,
  meal_type text not null check (meal_type in ('BREAKFAST','LUNCH','DINNER')),
  count integer not null check (count >= 0),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, meal_date, meal_type)
);

alter table eckcm_meal_manual_counts enable row level security;

comment on table eckcm_meal_manual_counts is 'UPJ staff manual (hand-counter) meal headcounts for reconciliation against system check-in counts. One row per event+date+meal; absence = not entered. Accessed only via service-role admin client.';
