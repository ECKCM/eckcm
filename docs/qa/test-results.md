# ECKCM Test Results

> Last updated: 2026-03-14
> Total: **168 tests** (150 Vitest + 18 Playwright E2E) — All passing

## Summary

| Category | Framework | Files | Tests | Status |
|----------|-----------|-------|-------|--------|
| Phase 1: Unit | Vitest | 8 | 100 | Pass |
| Phase 2: Integration | Vitest | 3 | 25 | Pass |
| Phase 3: API Route | Vitest | 3 | 25 | Pass |
| Phase 4: E2E | Playwright | 3 | 18 | Pass |
| **Total** | | **17** | **168** | **All Pass** |

## Commands

```bash
npm test                    # Vitest (150 tests, ~700ms)
npm run test:watch          # Vitest watch mode
npm run test:coverage       # Vitest + V8 coverage report
npm run test:e2e            # Playwright E2E (18 tests, ~11s)
npm run test:e2e:ui         # Playwright interactive UI mode
```

---

## Phase 1: Unit Tests (100 tests)

Pure functions — no external dependencies, no mocking required.

### `src/__tests__/unit/services/pricing.service.test.ts` — 30 tests

| Test Group | Tests | Covers |
|------------|-------|--------|
| Registration fee | 4 | Standard, early bird, null fallback, multi-group |
| Lodging fee | 4 | PER_NIGHT, FLAT rate, no match, multi-group |
| Additional lodging | 4 | Infant exemption (age < 4), threshold boundary, standard charge |
| Key deposit | 2 | Per-group deposit, zero when no lodging |
| Meal fee | 6 | Age-based tiers, full-day discount min(), free tier, no category |
| VBS materials | 2 | Per-participant charge, zero when no VBS |
| Manual payment discount | 2 | Percentage discount, zero for online |
| Totals | 6 | Sum verification, line item count, multi-group aggregation |

**Source**: `src/lib/services/pricing.service.ts`
**Risk**: HIGH — incorrect pricing = immediate revenue loss

### `src/__tests__/unit/utils/validators.test.ts` — 16 tests

| Test Group | Tests | Covers |
|------------|-------|--------|
| isValidCalendarDate | 8 | Feb 30 reject, Feb 29 leap year, month/day boundaries, invalid inputs |
| calculateAge | 8 | Birthday before/after reference, exact birthday, leap year, infant threshold |

**Source**: `src/lib/utils/validators.ts`
**Risk**: HIGH — age miscalculation = wrong meal pricing tier

### `src/__tests__/unit/services/epass.service.test.ts` — 15 tests

| Test Group | Tests | Covers |
|------------|-------|--------|
| generateToken | 2 | UUID→base64url (22 chars), uniqueness |
| verifyToken | 4 | Match, wrong token, wrong hash, empty input |
| signCode | 3 | 8-char HMAC format, consistency, different inputs differ |
| verifySignedCode | 6 | Correct signature, tampered, wrong secret, malformed input |

**Source**: `src/lib/services/epass.service.ts`
**Risk**: HIGH — token/HMAC bypass = unauthorized check-in

### `src/__tests__/unit/schemas/api.test.ts` — 16 tests

| Test Group | Tests | Covers |
|------------|-------|--------|
| estimateSchema | 3 | Valid input, missing fields, max 20 room groups |
| submitSchema | 2 | Valid submission, empty groups |
| createIntentSchema | 2 | Valid, missing registrationId |
| confirmSchema | 2 | Valid, wrong paymentMethod |
| zelleSchema | 2 | Valid, wrong type |
| Birth date validation | 5 | Feb 30, Feb 29 leap/non-leap, valid dates |

**Source**: `src/lib/schemas/api.ts`

### `src/__tests__/unit/services/confirmation-code.test.ts` — 8 tests

| Test Group | Tests | Covers |
|------------|-------|--------|
| generateConfirmationCode | 5 | Format (R26KIM0023), length, character set, profanity filter retry |
| Retry / fallback | 3 | Max retries, sequential fallback, uniqueness |

**Source**: `src/lib/services/confirmation-code.service.ts`

### `src/__tests__/unit/services/meal.service.test.ts` — 6 tests

| Test Group | Tests | Covers |
|------------|-------|--------|
| populateDefaultMeals | 6 | Default meal generation, event start/end date exclusion, preserve existing, participant date override, single-day event |

**Source**: `src/lib/services/meal.service.ts`

### `src/__tests__/unit/services/invoice.service.test.ts` — 5 tests

| Test Group | Tests | Covers |
|------------|-------|--------|
| generateInvoiceNumber | 3 | INV-YYYY-NNNN format, current year default, custom year |
| extractSeqFromConfirmationCode | 2 | Numeric extraction, zero-padded sequence |

**Source**: `src/lib/services/invoice.service.ts`

### `src/__tests__/unit/rate-limit.test.ts` — 4 tests

| Test Group | Tests | Covers |
|------------|-------|--------|
| RateLimiter | 4 | Allow within limit, block excess, reset after window, key isolation |

**Source**: `src/lib/rate-limit.ts`

---

## Phase 2: Integration Tests (25 tests)

Service-level tests with mocked Supabase client (DI via parameter).

### `src/__tests__/integration/services/refund.service.test.ts` — 8 tests

| Test Group | Tests | Covers |
|------------|-------|--------|
| getRefundSummary | 3 | Zero refunds, sum calculation, null handling |
| createRefundWithGuard | 5 | Within limit, **over-limit race condition detection**, rollback on over-limit, insert failure, exact-limit boundary |

**Source**: `src/lib/services/refund.service.ts`
**Risk**: CRITICAL — race condition in concurrent refunds = financial loss

### `src/__tests__/integration/services/registration.service.test.ts` — 9 tests

| Test Group | Tests | Covers |
|------------|-------|--------|
| cancelRegistration | 5 | Success, not found, wrong owner, already cancelled, update failure |
| deleteDraftRegistration | 4 | Cascade delete order (invoices→meals→participants→registration), empty invoices, null data |

**Source**: `src/lib/services/registration.service.ts`

### `src/__tests__/integration/services/checkin.service.test.ts` — 8 tests

| Test Group | Tests | Covers |
|------------|-------|--------|
| verifyAndCheckin | 8 | Success, invalid token, inactive e-pass, not paid, **duplicate check-in (23505)**, insert error, SHA-256 hash lookup, null sessionId |

**Source**: `src/lib/services/checkin.service.ts`

---

## Phase 3: API Route Tests (25 tests)

Route handler tests with module-level `vi.mock()` for Supabase/Stripe/Next.js.

### `src/__tests__/api/payment/stripe-fee.test.ts` — 7 tests

| Test Group | Tests | Covers |
|------------|-------|--------|
| Stripe fee formula | 7 | `Math.ceil((base+30)/(1-0.029))` for $50/$100/$500/$1000/$5000, test mode, coversFees=false |

**Source**: `src/app/api/payment/create-intent/route.ts`
**Risk**: HIGH — 1 cent rounding error = cumulative revenue loss

### `src/__tests__/api/payment/confirm.test.ts` — 10 tests

| Test Group | Tests | Covers |
|------------|-------|--------|
| POST /api/payment/confirm | 10 | Auth 401, invalid body 400, not found 404, forbidden 403, already_confirmed idempotent, non-DRAFT 409, **card confirmed (succeeded→PAID)**, **ACH processing (→SUBMITTED)**, bad PI status, metadata mismatch |

**Source**: `src/app/api/payment/confirm/route.ts`

### `src/__tests__/api/stripe/webhook.test.ts` — 8 tests

| Test Group | Tests | Covers |
|------------|-------|--------|
| POST /api/stripe/webhook | 8 | Missing signature, config not found, signature verification failure, **ACH succeeded→PAID**, idempotent already-PAID, no metadata, payment_failed→CANCELLED, unhandled event type |

**Source**: `src/app/api/stripe/webhook/route.ts`

---

## Phase 4: E2E Tests (18 tests)

Browser-based tests via Playwright (Chromium). Requires dev server running.

### `src/e2e/smoke.spec.ts` — 7 tests

| Test | Covers |
|------|--------|
| homepage loads and shows ECKCM title | H1 contains "ECKCM" |
| login page renders form | ECKCM title, email/password fields, sign in button |
| signup page renders | "Sign up with Email" visible |
| login page has link to signup | Sign up link present |
| login page has link to forgot password | Forgot password link present |
| terms page loads | /terms URL accessible |
| privacy page loads | /privacy URL accessible |

### `src/e2e/auth.spec.ts` — 5 tests

| Test | Covers |
|------|--------|
| /dashboard redirects to login | Unauthenticated redirect |
| /register redirects to login | Protected route guard |
| /admin redirects unauthorized | Admin role guard |
| login form shows error for invalid credentials | Error handling (Turnstile may block) |
| signup → login navigation | Cross-page link |

### `src/e2e/navigation.spec.ts` — 6 tests

| Test | Covers |
|------|--------|
| homepage → login navigation | Sign in link click |
| homepage → signup navigation | Sign up link click |
| login → forgot password | Forgot password link click |
| login → signup | Sign up link click |
| no console errors on homepage | Runtime error detection |
| no console errors on login page | Runtime error detection |

---

## Test Infrastructure

### Configuration Files

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest config: tsconfigPaths, node env, setup file |
| `playwright.config.ts` | Playwright config: chromium, auto dev server, traces |
| `src/__tests__/helpers/setup.ts` | Environment variable stubs |
| `src/__tests__/helpers/mock-supabase.ts` | Chainable Supabase query mock builder |

### Mock Strategy

| Phase | Mocking Approach |
|-------|-----------------|
| Phase 1 (Unit) | None — pure functions |
| Phase 2 (Integration) | `createMockSupabase()` — DI via parameter |
| Phase 3 (API Route) | `vi.mock()` — module-level (supabase, stripe, next/server, logger) |
| Phase 4 (E2E) | None — real app against dev server |

### Coverage Priority (by financial risk)

1. **Pricing calculation** — wrong price = revenue loss
2. **Refund race condition** — concurrent refund = over-refund
3. **Stripe fee formula** — rounding error = cumulative loss
4. **E-Pass token security** — HMAC bypass = unauthorized access
5. **Age calculation boundary** — off-by-one = wrong meal tier

---

## Future Test Additions

Planned but not yet implemented:

| Area | Tests | Priority |
|------|-------|----------|
| `src/lib/utils/formatters.ts` | Currency/phone/date formatting, K-12 classification | Medium |
| `api/registration/submit` | Duplicate detection, batch insert, invoice generation | High |
| `api/payment/create-intent` | Full intent creation flow (beyond fee calc) | Medium |
| `api/admin/refund` | Stripe refund creation, partial/full, status update | High |
| E2E: Registration + Payment | Full user flow with Stripe test card | High |
| E2E: Admin refund | Admin login → search → refund → verify | Medium |
| E2E: E-Pass check-in | Token entry → check-in → duplicate reject | Low |
