-- Admin scan-count adjustments for the Daily Meal Report. The "scanned" count
-- on that report is derived from individual eckcm_checkins rows (one row per
-- QR scan) and is never a single stored number — so to let admins correct it
-- without touching real check-in history, we store a signed delta per
-- event+date+meal here. The report shows: system count, adjustment, and
-- adjusted total = system + adjustment. Absence of a row = adjustment 0.
--
-- This is distinct from eckcm_meal_manual_counts (the UPJ hand-counter figure,
-- a standalone reconciliation number). This table corrects the *system* count.
--
-- Accessed only via the service-role admin client (RLS on, no policies →
-- denied to anon/authenticated). Applied to production via Supabase MCP
-- apply_migration; this file mirrors that DDL so the repo stays the source of
-- truth.

create table if not exists eckcm_meal_scan_adjustments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references eckcm_events(id) on delete cascade,
  meal_date date not null,
  meal_type text not null check (meal_type in ('BREAKFAST','LUNCH','DINNER')),
  -- Signed delta added to the system scanned count. May be negative (to remove
  -- erroneous/duplicate scans from the reported figure) but the adjusted total
  -- is clamped to >= 0 when displayed.
  adjustment integer not null default 0,
  note text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, meal_date, meal_type)
);

alter table eckcm_meal_scan_adjustments enable row level security;

comment on table eckcm_meal_scan_adjustments is 'Admin scan-count adjustments (signed delta) for the Daily Meal Report, per event+date+meal. Corrects the system check-in count without mutating eckcm_checkins. Absence = 0. Accessed only via service-role admin client.';
