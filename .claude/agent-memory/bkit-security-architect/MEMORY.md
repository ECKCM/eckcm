# Security Architect Memory - ECKCM Project

## Last Full Audit: 2026-02-26
- Score: 58/100 (25 issues: 3 CRITICAL, 8 HIGH, 8 MEDIUM, 6 LOW)
- See [audit-findings.md](audit-findings.md) for detailed issue list

## Key Security Architecture Notes
- Auth: Supabase Auth with session cookies managed by middleware (src/proxy.ts -> src/lib/supabase/middleware.ts)
- No src/middleware.ts -- uses src/proxy.ts as Next.js middleware
- Admin routes use per-route role checks (no centralized guard)
- Service role client: src/lib/supabase/admin.ts (bypasses RLS)
- Stripe keys stored in both env vars AND eckcm_app_config DB table
- Webhook handler tries multiple secrets: DB test/live + env var fallback

## Top Unresolved Risks
1. No rate limiting on any endpoint
2. No security headers in next.config.ts
3. XSS via dangerouslySetInnerHTML (3 locations, no DOMPurify)
4. /api/payment/methods and /api/admin/app-config GET have no auth
5. /api/email/confirmation lacks ownership check
6. No CSRF protection
7. Error messages leak internal details (Supabase/Stripe error strings)
8. No Zod validation on API route inputs (validators.ts exists but unused in routes)
9. Checkin endpoints (verify, batch-sync) have no staff role check

## Patterns Confirmed
- All payment mutation routes verify created_by_user_id === user.id
- Webhook signature verification is properly implemented
- Refund service has race-condition guard (post-insert sum check)
- Stripe keys properly masked in admin API responses
- Turnstile captcha present on auth pages (client-side only)
