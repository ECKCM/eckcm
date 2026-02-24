# Gap Detector Memory - ECKCM Project

## Last Analysis: online-registration (2026-02-24, v2.0)
- **Match Rate**: 76% (was 62%, +14% from design sync)
- **Report**: `docs/03-analysis/features/online-registration.analysis.md`
- **Design Doc**: `docs/02-design/features/online-registration.design.md` (v3)
- **Designed items**: 222 total, 165 implemented, 57 missing
- **Threshold**: 90% (need 35 more items)

## Key Findings (Post Iteration 1)
- Design v3 synced with impl: added 18 impl-only features, updated table names, enums, paths
- Score improvement came ENTIRELY from design sync, no code changes
- Core user flows (auth, wizard, dashboard, payment) remain 90%+ complete
- Admin sub-pages still biggest gap: 16 of 44 designed pages missing
- 6/10 designed services missing (inline in route handlers)
- 4/5 hooks missing (only use-mobile exists)
- 3 files still reference old `eckcm_system_settings` table name (BUG)
- `eckcm_fee_category_inventory` table in code but NOT in design

## Active Bugs Found
- `src/app/api/registration/submit/route.ts:120` references `eckcm_system_settings`
- `src/app/api/registration/estimate/route.ts:73` references `eckcm_system_settings`
- `src/app/api/admin/registration/route.ts:125` references `eckcm_system_settings`

## Project Structure Notes
- Tables use lowercase: `eckcm_users` (design v3 now matches)
- Design v3 acknowledges co-location pattern for components
- No SQL migration files in repository (DB managed via Supabase dashboard)
- No root `src/middleware.ts` exists (design says it should)

## Analysis Patterns
- Use `.from("eckcm_*")` grep to discover DB tables in use
- Admin components co-located with pages (e.g., `admin/participants/participants-table.tsx`)
- Design v3 component list only covers globally shared components (26 items)
- For weighted scoring: core user routes 25%, admin 20%, API 20%, services+hooks 10%

## Gap Priority for 90%
- High: admin sub-pages (16), API routes (12), services (6), hooks (4)
- Medium: email templates (3), types (2), middleware (1)
- Low/Deferrable: PWA (3), print pages (2), public pay/donate (2)
