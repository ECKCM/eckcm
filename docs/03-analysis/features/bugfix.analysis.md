# Gap Analysis: Bugfix Sprint (Final)

> Feature: `bugfix`
> Analysis Date: 2026-03-31
> Reference: `docs/01-plan/features/bugfix.plan.md`
> Previous Analysis: v0.1 (71.4%, Phase 3 unimplemented)
> Match Rate: **100% (14/14)**

---

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | Codebase-wide Bug Fix Sprint |
| Analyzed | 2026-03-31 |
| Total Items | 14 (2 Critical, 8 High Data, 4 High Security) |
| Implemented | 14 |
| Remaining | 0 |
| Match Rate | 100% |
| Delta from v0.1 | +28.6% (4 items closed: H9, H10, H11, H12) |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| **Problem** | 결제 webhook이 PAID 등록을 취소하고, 이중 환불, 레이스 컨디션, XSS/injection 취약점 등 금전/데이터/보안 버그 14개 |
| **Solution** | 3단계 스프린트로 전수 수정: 원자적 가드, 멱등성 검사, optimistic lock, 상태 전이 규칙, PostgREST 이스케이핑, HTML 이스케이프 |
| **Function UX Effect** | 결제 확인 중복 방지, $0 그룹 APPROVED 보호, SUPER_ADMIN 수동결제 유연 관리, 이메일 XSS 차단 |
| **Core Value** | 결제/환불 경로 원자성 확보 + 보안 강화. 14/14 항목 100% 완료 |

---

## Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Phase 1 — Critical (2 items) | 100% | PASS |
| Phase 2 — Data Integrity (8 items) | 100% | PASS |
| Phase 3 — Security (4 items) | 100% | PASS |
| Test Coverage (3 files) | 100% | PASS |
| **Overall** | **100%** | **PASS** |

---

## Phase 1 — Critical: Verification

### C1: Webhook payment_failed handler — MATCH

- **File**: `src/app/api/stripe/webhook/route.ts`
- Checks `registration.status === "PAID" || "REFUNDED"` → early return
- Never cancels PAID registrations

### C2: Stripe refund order — MATCH

- **C2-a**: `src/app/api/admin/refund/route.ts` — DB guard → Stripe → rollback on failure
- **C2-b**: `src/app/api/admin/registrations/[id]/adjustments/[adjustmentId]/process/route.ts` — same
- **C2-c**: `src/app/api/admin/registrations/[id]/adjustments/route.ts` — same

---

## Phase 2 — Data Integrity: Verification

### H1: Payment confirm atomic guard — MATCH

- **File**: `src/app/api/payment/confirm/route.ts`
- `.eq("status", "DRAFT")` on UPDATE; 0 rows → `already_confirmed`

### H2: Check/Zelle discount idempotency — MATCH

- **Files**: `check-submit/route.ts`, `zelle-submit/route.ts`
- Checks existing discount (sort_order=999, negative total) before INSERT

### H3: Processing PaymentIntent — MATCH

- **File**: `src/app/(protected)/register/payment-complete/page.tsx`
- `processing` → skip confirm, redirect with `?processing=true`, webhook handles it

### H4: Adjustment optimistic lock — MATCH

- **File**: `src/lib/services/adjustment.service.ts`
- `.eq("total_amount_cents", previousAmount)` on UPDATE; conflict → rollback + throw

### H5: cancelRegistration inventory recalc — MATCH

- **File**: `src/lib/services/registration.service.ts`
- `recalculateInventorySafe()` called after status update + epass deactivation

### H6: deleteDraftRegistration DRAFT check — MATCH

- **File**: `src/lib/services/registration.service.ts`
- Queries status first; throws if not DRAFT

### H7: Room assignment atomic guard — MATCH

- **File**: `src/lib/services/lodging.service.ts`
- Conditional UPDATE `.eq("room_assign_status", "PENDING")` + rollback on INSERT failure

### H8: Admin status transition rules + SUPER_ADMIN override — MATCH

- **File**: `src/app/api/admin/registration/status/route.ts`
- `ALLOWED_TRANSITIONS` map enforced; APPROVED = $0 terminal state
- SUPER_ADMIN bypass for manual payment (CHECK/ZELLE/MANUAL) AND $0 groups (no payment record)

---

## Phase 3 — Security: Verification

### H9: PostgREST filter escaping — MATCH

- **File**: `src/app/api/admin/email/logs/route.ts`
- Escapes `,.()"\\` characters before interpolation into `.or()` filter
- Superset of plan's 4 characters (added `"` and `\\`)

### H10: HTML escape utility + 5 templates — MATCH

- **File**: `src/lib/email/utils.ts` — `escapeHtml()` for `& < > " '`
- Applied across 5 templates (21 escape call sites):
  - `confirmation.tsx` — names, event details, zelle info, line items
  - `refund.tsx` — event details, reason
  - `invoice.tsx` — event name, participant names, line items
  - `epass.tsx` — person name, event name
  - `session-attendance.tsx` — session name, location, attendee names

### H11: Rate limiter limitation documentation — MATCH

- **File**: `src/lib/rate-limit.ts`
- Detailed JSDoc: per-instance limitation, distributed store upgrade path

### H12: Apple Pay domain requireAdmin() — MATCH

- **File**: `src/app/api/admin/apple-pay-domain/route.ts`
- POST + GET: `requireAdmin()` replaces manual `eckcm_users.role` check

---

## Test Coverage

| Test File | Items | Status |
|-----------|:-----:|:------:|
| `src/__tests__/api/stripe/webhook.test.ts` | C1 | PASS |
| `src/__tests__/api/payment/confirm.test.ts` | H1 | PASS |
| `src/__tests__/integration/services/registration.service.test.ts` | H5, H6 | PASS |

---

## Enhancement Beyond Plan

| Item | Location | Description |
|------|----------|-------------|
| SUPER_ADMIN bypass | `status/route.ts:54-81` | Role-based override for manual/zero-payment registrations |
| Extra PostgREST escaping | `email/logs/route.ts:32` | Escapes `"` and `\\` beyond plan's 4 characters |

---

## Comparison with v0.1

| Item | v0.1 | v1.0 | Change |
|------|:----:|:----:|--------|
| C1, C2, H1-H8 | MATCH | MATCH | — |
| H9 PostgREST escaping | GAP | MATCH | Fixed |
| H10 HTML escape | GAP | MATCH | Fixed |
| H11 Rate limiter docs | GAP | MATCH | Fixed |
| H12 Apple Pay requireAdmin | GAP | MATCH | Fixed |
| **Match Rate** | **71.4%** | **100%** | **+28.6%** |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-31 | Initial gap analysis — Phase 1+2 complete, Phase 3 pending (71.4%) | Claude |
| 1.0 | 2026-03-31 | Final analysis — all 14 items verified, 100% match rate | Claude |
