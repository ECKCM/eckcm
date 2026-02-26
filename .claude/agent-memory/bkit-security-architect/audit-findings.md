# Security Audit Findings - 2026-02-26

## CRITICAL
- C1: STRIPE_WEBHOOK_SECRET empty in .env.local
- C2: Real API keys in .env.local (check if committed to git)
- C3: No middleware-level API protection (src/proxy.ts only refreshes sessions)

## HIGH
- H1: /api/payment/methods & /api/admin/app-config GET - no auth
- H2: XSS - dangerouslySetInnerHTML without DOMPurify (3 files: instructions, privacy, terms)
- H3: /api/email/confirmation - no ownership check on registrationId
- H4: No security headers in next.config.ts
- H5: No rate limiting on any endpoint
- H6: Error messages leak Supabase/Stripe internals
- H7: No Zod input validation on API routes (submit, estimate, admin/registration)
- H8: /api/email/invoice accepts arbitrary recipient email

## MEDIUM
- M1: No CSRF protection
- M2: Admin role check logic duplicated/inconsistent across routes
- M3: Checkin verify/batch-sync have no staff/admin role check
- M4: Stripe secret keys stored in DB (eckcm_app_config)
- M5: HMAC signature truncated to 8 hex chars (32 bits)
- M6: E-Pass raw tokens stored alongside hashes
- M7: Turnstile not verified server-side on non-auth endpoints
- M8: No request body size limits

## LOW
- L1: No Content-Security-Policy
- L2: NEXT_PUBLIC_APP_URL = http://localhost:3000
- L3: Middleware doesn't protect /register/* routes
- L4: HMAC comparison should use timingSafeEqual
- L5: registration.service.ts uses 'user_id' instead of 'created_by_user_id'
- L6: Audit log schema inconsistency between service and direct inserts
