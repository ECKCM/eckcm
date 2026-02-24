# Gap Detector Memory - ECKCM Project

## Last Analysis: online-registration (2026-02-24, v4.0)
- **Match Rate**: 75% (stable since v3.0)
- **Report**: `docs/03-analysis/features/online-registration.analysis.md`
- **Design Doc**: `docs/02-design/features/online-registration.design.md` (v3)
- **Designed items**: 222 total, 166 implemented, 56 missing
- **Threshold**: 90% (need 34 more items)
- **Weighted rate**: 72.3% (impact-based)

## Key Findings (v4.0 Analysis)
- No code changes since v3.0 -- match rate stable at 75%
- Core user flows (auth, wizard, dashboard, payment) remain 90%+ complete
- Admin sub-pages still biggest gap: 16 of 44 designed pages missing
- Check-in sub-pages (5 missing) are highest priority cluster
- 6/10 designed services missing (inline in route handlers)
- 3/5 hooks missing (use-mobile + useRegistration exist)
- 13 undocumented impl items need design sync

## Active Bugs (UNFIXED since v2.0 -- CRITICAL)
- `src/app/api/registration/submit/route.ts:128` references `eckcm_system_settings`
- `src/app/api/registration/estimate/route.ts:73` references `eckcm_system_settings`
- `src/app/api/admin/registration/route.ts:125` references `eckcm_system_settings`
- All should be `eckcm_app_config` -- causes runtime errors

## Undocumented Implementation Items (13 total, need design sync)
- Table: `eckcm_fee_category_inventory` (inventory-manager.tsx)
- Service: `refund.service.ts`
- API routes: stripe-sync, refund/info, update-cover-fees
- Components: force-light-mode, payment-icons, check-visual
- Middleware: `src/proxy.ts` exists instead of `src/middleware.ts`
- Lib: `app-config.ts`, `color-theme.ts`, `offline-store.ts`, `registration-context.tsx`

## Project Structure Notes
- Tables use lowercase: `eckcm_users` (design v3 matches)
- Design v3 acknowledges co-location pattern for components
- No SQL migration files in repository (DB managed via Supabase dashboard)
- `src/proxy.ts` serves as middleware but isn't standard `middleware.ts`

## Analysis Patterns
- Use `.from("eckcm_*")` grep to discover DB tables in use
- Admin components co-located with pages (e.g., `admin/participants/participants-table.tsx`)
- Design v3 component list only covers globally shared components (26 items)
- Weighted scoring: core user routes 25%, admin 20%, API 20%, services+hooks 10%
- Check `useRegistration` in context file, not hooks directory
- DB tables only in RLS functions (permissions, role_permissions) count as implemented

## Gap Priority for 90% (34 items needed)
- Tier 1 (15 items, ~30hrs): checkin sub-pages, service extractions, email routes, middleware
- Tier 2 (12 items, ~31hrs): admin lodging/meals/users pages, export, types
- Tier 3 (7 items, ~31hrs): PWA, print, donate, sheets -- deferrable
- Alternative: Implement Tier 1+2 (27 items) + defer Tier 3 from design = 90%
