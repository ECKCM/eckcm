-- Rollback: drop the standalone meal-pass tables.
-- Drop the redemption ledger first (FK → eckcm_meal_passes).
DROP TABLE IF EXISTS public.eckcm_meal_pass_redemptions;
DROP TABLE IF EXISTS public.eckcm_meal_passes;
