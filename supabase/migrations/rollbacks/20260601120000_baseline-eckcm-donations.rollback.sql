-- Rollback for: 20260601120000_baseline-eckcm-donations.sql
--
-- ⚠️  DESTRUCTIVE — DROPS THE DONATIONS TABLE AND ALL DONATION RECORDS.
-- ⚠️  DO NOT RUN ON PRODUCTION. The forward migration is a retroactive baseline
--     for a table that already holds live data; "rolling it back" would delete
--     real donations. This file exists only to satisfy the repo's rollback
--     convention and for use on throwaway/local databases.

drop trigger if exists set_eckcm_donations_updated_at on public.eckcm_donations;
drop table if exists public.eckcm_donations;
-- moddatetime extension is shared; intentionally NOT dropped.
