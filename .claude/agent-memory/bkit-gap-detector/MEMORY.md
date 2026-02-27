# Gap Detector Memory - ECKCM Project

## Last Analysis: online-registration (2026-02-26, v5.0)
- **Match Rate**: 93% (up from 75% in v4.0)
- **Report**: `docs/03-analysis/features/online-registration.analysis.md`
- **Design Doc**: `docs/02-design/features/online-registration.design.md` (v3)
- **Designed items**: 222 total, 206 implemented, 16 missing
- **Threshold**: 90% -- ACHIEVED (+6 items over)
- **Weighted rate**: 91.9% (impact-based)
- **Delta from v4.0**: +40 items implemented

## Key Findings (v5.0 Analysis)
- Major implementation sprint closed 40 gaps in 2 days
- Admin routes: 44/44 = 100% (was 28/44, all 16 missing pages added)
- API routes: 29/33 = 88% (8 new routes: cancel, delta, 3 email, 2 export, cancel)
- Services: 9/10 = 90% (5 new: checkin, registration, meal, audit + refund existed)
- Components: 26/26 = 100% (payment-method-selector added)
- Hooks: 4/5 = 80% (use-realtime + use-offline-checkin added)
- Lib: 27/27 = 100% (3 email templates, 2 types, middleware)
- DB tables unchanged: 34/39 = 87% (5 tables still not referenced in code)
- PWA unchanged: 1/4 = 25% (no service worker)

## Bug Status
- `eckcm_system_settings` bug: FIXED (was critical since v2.0, now resolved)
- No known critical bugs

## Remaining Missing Items (16 total)
- Public pages: pay/[code], donate (2)
- API routes: donate, lodging/magic-generator, invoices/custom, sheets/sync (4)
- Services: lodging.service.ts, sheets.service.ts (2)
- Hooks: use-auth.ts (1, likely intentional -- Supabase SDK used directly)
- DB tables not referenced: form_field_config, meal_rules, meal_selections, sheets_cache (4+1)
- PWA: sw.js, SW config, offline wiring (3)

## Undocumented Implementation Items (15 total, need design sync)
- Table: `eckcm_fee_category_inventory`
- Service: `refund.service.ts`
- API routes: stripe-sync, refund/info, update-cover-fees, registration/status, events/[eventId]
- Components: force-light-mode, payment-icons, check-visual, sanitized-html
- Lib: `app-config.ts`, `color-theme.ts`, `offline-store.ts`, `registration-context.tsx`

## Project Structure Notes
- Tables use lowercase: `eckcm_users` (design v3 matches)
- Design v3 acknowledges co-location pattern for components
- No SQL migration files in repository (DB managed via Supabase dashboard)
- `src/middleware.ts` now exists (standard Next.js middleware, was missing in v4)
- `src/proxy.ts` may still exist but middleware.ts is the canonical file

## Analysis Patterns
- Use `.from("eckcm_*")` grep to discover DB tables in use
- Admin components co-located with pages (e.g., `admin/participants/participants-table.tsx`)
- Design v3 component list only covers globally shared components (26 items)
- Weighted scoring: core user routes 25%, admin 20%, API 20%, services+hooks 10%
- Check `useRegistration` in context file, not hooks directory
- DB tables only in RLS functions (permissions, role_permissions) count as implemented
- Some new admin pages are placeholder/scaffold (form-fields, google-sheets, print) -- still count
