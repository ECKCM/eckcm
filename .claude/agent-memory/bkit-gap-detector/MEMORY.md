# Gap Detector Memory - ECKCM Project

## Last Analysis: online-registration (2026-03-01, v6.0)
- **Match Rate**: 92% (down from 93% in v5.0 due to webhook regression)
- **Report**: `docs/03-analysis/features/online-registration.analysis.md`
- **Design Doc**: `docs/02-design/features/online-registration.design.md` (v3)
- **Designed items**: 222 total, 205 implemented, 17 missing
- **Threshold**: 90% -- ACHIEVED (+5 items over)
- **Weighted rate**: 91.3% (impact-based)
- **Delta from v5.0**: -1 item (webhook removed)

## Key Findings (v6.0 Analysis)
- Stripe webhook route REMOVED (regression): `src/app/api/webhooks/stripe/route.ts` deleted
- Payment now uses synchronous confirm flow, not async webhook
- Email system expanded: 4 new admin email API routes (logs, send, config, announcement)
- New production infra: logger.ts, rate-limit.ts, auth/admin.ts
- New DB table: `eckcm_email_logs` (undocumented)
- `src/middleware.ts` renamed to `src/proxy.ts` (Next.js 16 convention)
- `check-visual.tsx` component removed (payment page restructured)
- Undocumented items grew from 15 to 27 -- design doc sync urgently needed
- No new design gaps were closed (all 16 from v5.0 remain + 1 new regression)

## Remaining Missing Items (17 total)
- Public pages: pay/[code], donate (2)
- API routes: donate, webhooks/stripe (REGRESSION), lodging/magic-generator, invoices/custom, sheets/sync (5)
- Services: lodging.service.ts, sheets.service.ts (2)
- Hooks: use-auth.ts (1, likely intentional -- Supabase SDK used directly)
- DB tables not referenced: form_field_config, meal_rules, meal_selections, sheets_cache (4+1)
- PWA: sw.js, SW config, offline wiring (3)

## Undocumented Implementation Items (27 total, need design sync)
- Tables: `eckcm_fee_category_inventory`, `eckcm_email_logs` (NEW)
- Service: `refund.service.ts`
- API routes: stripe-sync, refund/info, update-cover-fees, registration/status, events/[eventId], admin/email/logs (NEW), admin/email/send (NEW), admin/email/config (NEW), admin/email/announcement (NEW)
- Components: force-light-mode, payment-icons, sanitized-html (check-visual REMOVED)
- Lib: `app-config.ts`, `color-theme.ts`, `offline-store.ts`, `registration-context.tsx`, `email-log.service.ts` (NEW), `email-config.ts` (NEW), `logger.ts` (NEW), `rate-limit.ts` (NEW), `auth/admin.ts` (NEW)
- Pages: (public)/error.tsx (NEW), (protected)/error.tsx (NEW), (protected)/loading.tsx (NEW)

## Project Structure Notes
- Tables use lowercase: `eckcm_users` (design v3 matches)
- Design v3 acknowledges co-location pattern for components
- No SQL migration files in repository (DB managed via Supabase dashboard)
- `src/proxy.ts` is the canonical middleware file (Next.js 16 rename from middleware.ts)
- `src/middleware.ts` NO LONGER EXISTS -- do not check for it

## Analysis Patterns
- Use `.from("eckcm_*")` grep to discover DB tables in use
- Admin components co-located with pages (e.g., `admin/participants/participants-table.tsx`)
- Design v3 component list only covers globally shared components (26 items)
- Weighted scoring: core user routes 25%, admin 20%, API 20%, services+hooks 10%
- Check `useRegistration` in context file, not hooks directory
- DB tables only in RLS functions (permissions, role_permissions) count as implemented
- Stripe webhooks dir is empty/removed -- check api/webhooks/ carefully
- New email admin routes at api/admin/email/* are NOT in design
