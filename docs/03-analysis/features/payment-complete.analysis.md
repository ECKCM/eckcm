# Gap Analysis: payment-complete

> Feature: `payment-complete`
> Design: `docs/02-design/features/payment-complete.design.md`
> Analysis Date: 2026-03-27
> Match Rate: **93%** (90/97 items)

---

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | payment-complete — Full payment lifecycle |
| Design Items | 97 |
| Matched | 90 |
| Gaps (Design not in Impl) | 3 |
| Extras (Impl not in Design) | 9 |
| Changed (Design differs) | 6 |
| **Match Rate** | **93%** |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| **Problem** | Retroactive design doc needed for full payment lifecycle (card, Zelle, check, admin manual) |
| **Solution** | Comprehensive design-vs-implementation comparison across 12 API endpoints, 6 DB tables, Stripe integration |
| **Function UX Effect** | Identified webhook parity gap that could cause missing ledger entries if `/confirm` fails |
| **Core Value** | Financial audit trail integrity ensured through gap detection |

---

## Category Scores

| Category | Items | Matched | Rate | Status |
|----------|:-----:|:-------:|:----:|:------:|
| API Endpoints (existence) | 12 | 12 | 100% | PASS |
| Request/Response Shapes | 13 | 11 | 85% | WARN |
| Database Schema | 12 | 10 | 83% | WARN |
| Stripe Integration | 8 | 6 | 75% | WARN |
| User Flows | 4 | 4 | 100% | PASS |
| Component Design | 7 | 7 | 100% | PASS |
| Email Notifications | 4 | 4 | 100% | PASS |
| Audit/Logging | 5 | 4 | 80% | WARN |
| Idempotency | 5 | 5 | 100% | PASS |
| Security | 7 | 7 | 100% | PASS |
| Implementation Files | 20 | 20 | 100% | PASS |
| **TOTAL** | **97** | **90** | **93%** | **PASS** |

---

## Gaps: Design Items NOT in Implementation

| # | Severity | Item | Design Section | Description |
|---|----------|------|----------------|-------------|
| G1 | Medium | `type: "registration"` metadata | 3.2 | `create-intent` does not set `type` in PI metadata; webhook relies on absence of `type === "donation"` |
| G2 | **High** | Webhook missing `insertInitialPayment()` | 3.3 + 7.2 | Webhook `payment_intent.succeeded` handler does NOT create adjustment ledger entry |
| G3 | Medium | Webhook missing `syncRegistration()` | 3.3 | Webhook handler does NOT sync to Google Sheets |

---

## Changed: Design Differs from Implementation

| # | Item | Design | Implementation | Impact |
|---|------|--------|----------------|--------|
| C1 | `create-intent` response field | `feeAmount` | `feeCents` | Low |
| C2 | `create-intent` response | `paymentIntentId` returned | Not returned (extracted from clientSecret) | Low |
| C3 | Invoice status for paid | `PAID` | `SUCCEEDED` | Medium |
| C4 | Payment column name | `method` | `payment_method` | Medium |
| C5 | Admin manual body | `{ registrationId, method, amount_cents?, notes? }` | `{ invoiceId, paymentMethod, note? }` | High |
| C6 | `eckcm_payments` fields | `cover_fees`, `fee_amount_cents` populated | Columns never written to | Low |

---

## Extras: Implementation Items NOT in Design

| # | Item | Location | Description |
|---|------|----------|-------------|
| E1 | `payment_intent.payment_failed` handler | webhook route | Cancels registration + marks payment FAILED |
| E2 | Donation payment handling | webhook route | Handles `type === "donation"` payments |
| E3 | Rate limiting | info, create-intent routes | `rateLimit()` calls |
| E4 | DRAFT registration cancellation on unload | payment page | `sendBeacon` to `cancel-drafts` |
| E5 | Stripe publishable key fetch per event | payment page | `/api/stripe/publishable-key` call |
| E6 | `recalculateInventorySafe()` | zelle/check/confirm/webhook | Inventory recalculation |
| E7 | `syncRegistration()` | confirm, zelle-submit, check-submit | Google Sheets sync |
| E8 | Admin uses `invoiceId` | admin/payment/manual | Different request body |
| E9 | Admin validates invoice status | admin/payment/manual | Extra validation |

---

## Recommended Actions

### Priority 1: Code Fixes (High Severity)

| # | Action | File |
|---|--------|------|
| 1 | Add `insertInitialPayment()` to webhook succeeded handler | `src/app/api/stripe/webhook/route.ts` |
| 2 | Add `syncRegistration()` to webhook succeeded handler | `src/app/api/stripe/webhook/route.ts` |

### Priority 2: Design Doc Updates

| # | Action |
|---|--------|
| 3 | Update Section 2.11 admin manual body to `{ invoiceId, paymentMethod, note? }` |
| 4 | Update Section 1.2 invoice status to include `SUCCEEDED` |
| 5 | Add `payment_intent.payment_failed` handling to Section 3.3 |
| 6 | Document rate limiting, inventory recalc, and Sheets sync |

### Priority 3: Low Priority Cleanup

| # | Action |
|---|--------|
| 7 | Set `type: "registration"` in PI metadata |
| 8 | Harmonize field naming (`feeCents`/`feeAmount`, `method`/`payment_method`) |
| 9 | Add `paid_at`, `sort_order` to TypeScript interfaces |
| 10 | Remove stale `referenceNote` from `ZelleSubmitRequest` |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-27 | Initial gap analysis (retroactive design vs implementation) |
