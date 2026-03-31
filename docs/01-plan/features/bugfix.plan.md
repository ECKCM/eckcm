# Plan: Codebase Bug Fix Sprint

> Feature: `bugfix`
> Created: 2026-03-31
> Status: Draft
> Level: Dynamic (Next.js 16 + Supabase + Stripe)

---

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | Codebase-wide Bug Fix Sprint |
| Created | 2026-03-31 |
| Bugs Found | 50 (2 Critical, 12 High, 22 Medium, 14 Low) |
| Estimated Scope | ~35 files across 5 domains |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| **Problem** | 결제 webhook이 정상 PAID 등록을 취소하고, Stripe 환불이 DB guard 전에 실행되어 이중 환불이 발생하며, 레이스 컨디션으로 중복 처리가 일어나는 등 돈과 데이터 무결성에 직결되는 버그가 존재한다. |
| **Solution** | Critical/High 버그 14개를 3단계 우선순위로 나누어 수정. 1단계: 금전 손실 방지(webhook, 환불 순서), 2단계: 데이터 무결성(레이스 컨디션, 상태 검증), 3단계: 보안/UX(XSS, rate limit, validation). |
| **Function UX Effect** | 결제 완료 후 등록이 임의 취소되지 않고, 환불이 정확히 1회만 처리되며, 관리자 상태 전이가 규칙에 따라 제한되어 운영 신뢰도가 크게 향상된다. |
| **Core Value** | 캠프 등록/결제 시스템의 재무적 정확성과 데이터 무결성 확보. 돈을 다루는 모든 경로에서 원자성과 멱등성을 보장한다. |

---

## 1. Overview

### 1.1 Purpose

2026-03-31 전체 코드베이스 분석에서 발견된 50개 버그를 체계적으로 수정하여 시스템 안정성과 재무 정확성을 확보한다.

### 1.2 Background

Registration은 정상 작동하지만, 결제 처리, 관리자 API, 서비스 레이어에서 레이스 컨디션, 원자성 부재, 검증 누락 등 프로덕션 환경에서 데이터 손실이나 금전 오류를 유발할 수 있는 버그가 다수 발견되었다.

### 1.3 Related Documents

- Bug Analysis: 2026-03-31 conversation (this session)
- Previous Plan: `registration-adjustment-ledger.plan.md`

---

## 2. Scope

### 2.1 In Scope (Phase 1 — Critical: 금전 손실 방지)

- [x] **C1** Webhook `payment_failed` 핸들러에서 PAID 등록 취소 방지
- [x] **C2** Stripe 환불을 DB guard 이후로 순서 변경 (3개 엔드포인트)

### 2.2 In Scope (Phase 2 — High: 데이터 무결성)

- [ ] **H1** Payment confirm에 원자적 상태 가드 추가 (`.eq("status", "DRAFT")`)
- [ ] **H2** Check/Zelle submit에 멱등성 가드 추가
- [ ] **H3** Processing PaymentIntent에 대한 적절한 처리 경로 추가
- [ ] **H4** Adjustment service에 DB-level 잠금(FOR UPDATE) 또는 optimistic lock 적용
- [ ] **H5** `cancelRegistration()`에 `recalculateInventorySafe()` 호출 추가
- [ ] **H6** `deleteDraftRegistration()`에 실제 DRAFT 상태 검증 추가
- [ ] **H7** Room assignment을 트랜잭션으로 처리 (Supabase RPC)
- [ ] **H8** Admin 상태 변경에 허용 전이 규칙 적용

### 2.3 In Scope (Phase 3 — High: 보안)

- [ ] **H9** Email 로그 검색에 PostgREST 필터 이스케이핑
- [ ] **H10** 이메일 템플릿에 HTML 이스케이프 함수 적용
- [ ] **H11** Rate limiter를 Upstash Redis로 교체 (또는 Supabase RPC 기반)
- [ ] **H12** Apple Pay 도메인 엔드포인트 역할 검사를 `requireAdmin()` 패턴으로 통일

### 2.4 Out of Scope (Medium/Low — 별도 스프린트)

- Medium 22개: 후속 스프린트에서 처리
- Low 14개: 백로그로 관리
- 새 기능 추가 없음 — 순수 버그 수정만 진행

---

## 3. Requirements

### 3.1 Phase 1 — Critical (즉시)

| ID | Requirement | File(s) | Priority |
|----|-------------|---------|----------|
| C1 | `payment_failed` webhook에서 PAID 등록 취소 로직 제거. DRAFT만 cleanup 대상. 이미 PAID인 등록은 건드리지 않음 | `src/app/api/stripe/webhook/route.ts` | Critical |
| C2-a | `/api/admin/refund`: DB guard 통과 후에만 `stripe.refunds.create()` 실행 | `src/app/api/admin/refund/route.ts` | Critical |
| C2-b | `/api/admin/.../adjustments/.../process`: 동일 패턴 적용 | `src/app/api/admin/registrations/[id]/adjustments/[adjustmentId]/process/route.ts` | Critical |
| C2-c | `/api/admin/.../adjustments`: 동일 패턴 적용 | `src/app/api/admin/registrations/[id]/adjustments/route.ts` | Critical |

### 3.2 Phase 2 — High: Data Integrity

| ID | Requirement | File(s) | Priority |
|----|-------------|---------|----------|
| H1 | Confirm 엔드포인트에 `.eq("status", "DRAFT")` 원자적 가드. 업데이트 결과 count=0이면 중복 처리로 간주하고 성공 응답 반환 | `src/app/api/payment/confirm/route.ts` | High |
| H2 | Check/Zelle submit에서 할인 적용 전 기존 할인 라인 아이템 존재 여부 확인. 이미 있으면 skip | `src/app/api/payment/check-submit/route.ts`, `zelle-submit/route.ts` | High |
| H3 | `payment-complete` 페이지에서 `processing` 상태 시 confirm 호출하지 않고 polling 또는 webhook 의존으로 전환 | `src/app/(protected)/register/payment-complete/page.tsx` | High |
| H4 | `createAdjustment()`에서 Supabase RPC로 `SELECT ... FOR UPDATE` 후 업데이트, 또는 버전 필드 기반 optimistic lock | `src/lib/services/adjustment.service.ts` | High |
| H5 | `cancelRegistration()` 마지막에 `recalculateInventorySafe()` 호출 추가 | `src/lib/services/registration.service.ts` | High |
| H6 | `deleteDraftRegistration()` 시작부에 상태 확인 쿼리 추가. DRAFT가 아니면 에러 throw | `src/lib/services/registration.service.ts` | High |
| H7 | `assignRoom()`을 Supabase RPC 트랜잭션으로 변환 (INSERT + UPDATE를 단일 함수로) | `src/lib/services/lodging.service.ts` | High |
| H8 | 허용 상태 전이 맵 정의: `{ DRAFT: [SUBMITTED, CANCELLED], SUBMITTED: [APPROVED, CANCELLED], ...}`. 맵에 없는 전이 시 400 에러 | `src/app/api/admin/registration/status/route.ts` | High |

### 3.3 Phase 3 — High: Security

| ID | Requirement | File(s) | Priority |
|----|-------------|---------|----------|
| H9 | search 파라미터에서 PostgREST 특수문자(`,`, `.`, `(`, `)`) 이스케이프 | `src/app/api/admin/email/logs/route.ts` | High |
| H10 | HTML escape 유틸 함수 생성 후 5개 이메일 템플릿의 모든 사용자 입력 필드에 적용 | `src/lib/email/templates/*.tsx` | High |
| H11 | Supabase RPC 기반 rate limiter로 교체 (또는 기존 인메모리 유지하되 주석으로 한계 명시) | `src/lib/rate-limit.ts` | High |
| H12 | Apple Pay 엔드포인트에서 `requireAdmin()` 사용 | `src/app/api/admin/apple-pay-domain/route.ts` | High |

### 3.4 Non-Functional Requirements

| Category | Criteria | Measurement |
|----------|----------|-------------|
| Regression | 기존 테스트 전체 통과 | `npm run test` |
| Atomicity | 결제/환불 관련 모든 DB 업데이트에 원자적 가드 | Code review |
| Idempotency | 중복 요청에도 1회만 처리 | 수동 테스트 (더블클릭) |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] Phase 1 (Critical) 2개 버그 수정 완료
- [ ] Phase 2 (High Data) 8개 버그 수정 완료
- [ ] Phase 3 (High Security) 4개 버그 수정 완료
- [ ] 기존 테스트 전체 통과 (`npm run test`)
- [ ] 각 수정에 대한 코드 리뷰 완료

### 4.2 Quality Criteria

- [ ] Zero regression (기존 기능 정상 동작)
- [ ] 결제 관련 수정은 실제 Stripe test mode에서 검증
- [ ] 레이스 컨디션 수정은 동시성 시나리오 수동 테스트

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Webhook 수정으로 미결제 DRAFT 정리가 안 됨 | Medium | Medium | DRAFT 상태에 대한 별도 cleanup 로직 유지 |
| 환불 순서 변경으로 DB 실패 시 환불 불가 | Medium | Low | DB 실패 시 적절한 에러 메시지 + 관리자 재시도 안내 |
| 상태 전이 제한으로 관리자 워크플로 차단 | High | Low | 전이 맵을 실제 운영 시나리오 기반으로 설계 + SUPER_ADMIN 오버라이드 |
| Rate limiter 교체가 외부 의존성 추가 | Low | Low | 기존 인메모리 유지 + 주석 처리를 대안으로 |

---

## 6. Architecture Considerations

### 6.1 Project Level

| Level | Selected |
|-------|:--------:|
| **Dynamic** (Next.js + Supabase + Stripe) | ✅ |

### 6.2 Key Architectural Decisions

| Decision | Selected | Rationale |
|----------|----------|-----------|
| 원자적 상태 가드 | `.eq("status", ...)` 조건부 UPDATE | Supabase에서 트랜잭션 없이 가능한 가장 간단한 원자성 확보 방법 |
| 환불 순서 | DB guard → Stripe → DB update | DB에서 먼저 검증하고, Stripe 실행 후 결과 기록. DB 실패 시 Stripe 호출 안 함 |
| 상태 전이 | 허용 맵 (allowedTransitions) | 코드 내 단순 객체로 관리. DB constraint보다 유연하고 에러 메시지 커스텀 가능 |
| HTML 이스케이프 | 유틸 함수 1개 | `&`, `<`, `>`, `"`, `'` 변환. 5개 템플릿에서 공유 |

---

## 7. Implementation Order

```
Phase 1 (Critical) — 즉시
├── C1: Webhook payment_failed 핸들러 수정
└── C2: 환불 3개 엔드포인트 순서 변경

Phase 2 (High Data) — 1일차
├── H1: Payment confirm 원자적 가드
├── H2: Check/Zelle 멱등성 가드
├── H3: Processing PI 처리 경로
├── H5: cancelRegistration 재고 갱신
├── H6: deleteDraft 상태 검증
└── H8: Admin 상태 전이 규칙

Phase 2 (High Data) — 2일차
├── H4: Adjustment service 동시성 제어
└── H7: Room assignment 트랜잭션

Phase 3 (High Security) — 3일차
├── H9: PostgREST 필터 이스케이핑
├── H10: 이메일 템플릿 XSS 방지
├── H11: Rate limiter 개선
└── H12: Apple Pay 역할 검사 통일
```

---

## 8. Next Steps

1. [ ] `/pdca design bugfix` — 각 버그 수정의 구체적 코드 변경 설계
2. [ ] Phase 1 (Critical) 즉시 구현 시작
3. [ ] Phase 2, 3 순차 진행

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-31 | Initial draft from codebase bug analysis | Claude |
