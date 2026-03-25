# Plan: Registration Adjustment Ledger

> Feature: `registration-adjustment-ledger`
> Created: 2026-03-24
> Status: Draft
> Level: Dynamic (Next.js + Supabase + Stripe)

---

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | Registration Adjustment Ledger |
| Created | 2026-03-24 |
| Estimated Scope | 7 files (1 migration, 2 services, 2 API routes, 1 UI component, 1 type file) |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| **Problem** | 등록 완료 후 날짜 변경, 옵션 변경, 할인, 취소 등 가격 변동이 발생하면 현재 시스템에서는 추적이 불가능하며, 관리자가 수동으로 금액을 계산하고 Stripe에서 별도로 환불/추가결제를 처리해야 한다. |
| **Solution** | `eckcm_registration_adjustments` 테이블을 중심으로 모든 가격 변동을 시간순 ledger로 기록하고, 관리자가 adjustment를 생성하면 자동으로 차액을 계산하여 Stripe charge/refund를 처리하는 통합 시스템을 구축한다. |
| **Function UX Effect** | Admin이 등록 상세 페이지에서 "Adjustments" 탭을 통해 전체 금액 변동 이력을 한눈에 확인하고, running balance를 실시간으로 파악하며, 한 번의 클릭으로 추가결제/환불을 처리할 수 있다. |
| **Core Value** | 재무 투명성과 감사 추적(audit trail) 확보. 모든 금액 변동에 대한 사유, 담당자, Stripe 연동 상태가 기록되어 캠프 운영의 재정 관리 신뢰성을 높인다. |

---

## 1. Overview

등록 후 발생하는 모든 가격 변동(날짜 변경, 옵션 추가/제거, 할인 적용, 관리자 보정, 취소 등)을 시간순으로 추적하는 **Adjustment Ledger** 시스템. 각 adjustment는 변동 전후 금액, 차액, 처리 상태(charge/refund/credit/waive/pending), Stripe 연동 정보를 기록한다.

### 핵심 목적
- 등록별 모든 가격 변동 이력 추적 (financial audit trail)
- 초기 결제 시 `initial_payment` 레코드 자동 삽입
- 관리자가 adjustment 생성 시 차액 자동 계산
- Pending adjustment에 대한 Stripe charge/refund 실행
- Running balance 실시간 표시 (총 청구, 총 환불, 순 잔액)

---

## 2. Domain Context

### 기존 시스템과의 관계

```
eckcm_registrations (1)
  └── eckcm_invoices (1)
        └── eckcm_invoice_line_items (N)
        └── eckcm_payments (N)
              └── eckcm_refunds (N)
  └── eckcm_registration_adjustments (N)  ← NEW
```

- **registrations**: 등록 상태 관리 (DRAFT → PAID → CANCELLED 등)
- **invoices**: 원본 인보이스 (최초 결제 기준)
- **payments**: Stripe PaymentIntent 기반 결제 기록
- **refunds**: 기존 환불 기록 (payment 단위)
- **registration_adjustments** (NEW): 등록 단위 금액 변동 ledger

### 기존 refunds 테이블과의 차이
| 항목 | eckcm_refunds | eckcm_registration_adjustments |
|------|--------------|-------------------------------|
| 단위 | Payment 기준 | Registration 기준 |
| 방향 | 환불만 | 추가결제 + 환불 + 크레딧 + 면제 |
| 용도 | Stripe refund 추적 | 모든 가격 변동의 비즈니스 로직 추적 |
| 유지 | 그대로 유지 (Stripe 환불 기록) | 새로 추가 (비즈니스 레벨 ledger) |

> `eckcm_refunds`는 기존대로 유지한다. Adjustment ledger는 상위 레벨에서 "왜 이 금액이 변경되었는가"를 추적하는 비즈니스 로그이며, 실제 Stripe 처리는 기존 refund/payment 흐름을 재사용한다.

---

## 3. Data Model

### 3.1 eckcm_registration_adjustments

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, default gen_random_uuid() | 고유 식별자 |
| `registration_id` | UUID | FK → eckcm_registrations, NOT NULL | 대상 등록 |
| `adjustment_type` | TEXT | NOT NULL, CHECK IN(...) | 변경 유형 |
| `previous_amount` | INTEGER | NOT NULL | 변경 전 총액 (cents) |
| `new_amount` | INTEGER | NOT NULL | 변경 후 총액 (cents) |
| `difference` | INTEGER | NOT NULL | 차액 (cents, 양수=추가결제, 음수=환불) |
| `action_taken` | TEXT | NOT NULL, CHECK IN(...) | 처리 방법 |
| `stripe_payment_intent_id` | TEXT | NULLABLE | Stripe 추가결제 PI ID |
| `stripe_refund_id` | TEXT | NULLABLE | Stripe 환불 ID |
| `reason` | TEXT | NOT NULL | 변경 사유 (관리자 필수 입력) |
| `adjusted_by` | UUID | FK → auth.users, NOT NULL | 처리자 |
| `metadata` | JSONB | DEFAULT '{}' | 추가 정보 (변경 상세 등) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | 생성 시각 |

### 3.2 Enum Values

**adjustment_type:**
| Value | Description |
|-------|-------------|
| `initial_payment` | 최초 결제 (자동 삽입) |
| `date_change` | 체크인/체크아웃 날짜 변경 |
| `option_change` | 옵션 변경 (숙박, 식사, VBS 등) |
| `discount` | 할인 적용 |
| `cancellation` | 등록 취소 |
| `admin_correction` | 관리자 수동 보정 |

**action_taken:**
| Value | Description |
|-------|-------------|
| `charge` | 추가 결제 처리됨 |
| `refund` | 환불 처리됨 |
| `credit` | 크레딧으로 보관 (향후 사용) |
| `waive` | 면제 (차액 없이 처리) |
| `pending` | 처리 대기 중 |

### 3.3 RLS Policy

```sql
-- Admin only: SUPER_ADMIN, EVENT_ADMIN
CREATE POLICY "admin_only_adjustments" ON eckcm_registration_adjustments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM eckcm_staff_assignments sa
      JOIN eckcm_roles r ON r.id = sa.role_id
      WHERE sa.user_id = auth.uid()
        AND sa.is_active = true
        AND r.name IN ('SUPER_ADMIN', 'EVENT_ADMIN')
    )
  );
```

### 3.4 Indexes

```sql
CREATE INDEX idx_adj_registration_id ON eckcm_registration_adjustments(registration_id);
CREATE INDEX idx_adj_created_at ON eckcm_registration_adjustments(created_at);
CREATE INDEX idx_adj_type ON eckcm_registration_adjustments(adjustment_type);
```

---

## 4. API Design

### 4.1 GET /api/admin/registrations/[id]/adjustments

등록의 전체 adjustment 이력 조회.

**Auth**: `requireAdmin()` (SUPER_ADMIN, EVENT_ADMIN)

**Response**:
```json
{
  "adjustments": [
    {
      "id": "uuid",
      "adjustment_type": "initial_payment",
      "previous_amount": 0,
      "new_amount": 35000,
      "difference": 35000,
      "action_taken": "charge",
      "stripe_payment_intent_id": "pi_xxx",
      "reason": "Initial registration payment",
      "adjusted_by": "uuid",
      "adjusted_by_name": "Admin Name",
      "metadata": {},
      "created_at": "2026-06-15T10:00:00Z"
    }
  ],
  "summary": {
    "original_amount": 35000,
    "current_amount": 32000,
    "total_charged": 35000,
    "total_refunded": 3000,
    "total_waived": 0,
    "total_credited": 0,
    "net_balance": 32000,
    "pending_count": 0
  }
}
```

### 4.2 POST /api/admin/registrations/[id]/adjustments

새 adjustment 생성. 차액 자동 계산.

**Auth**: `requireAdmin()`

**Request Body**:
```json
{
  "adjustment_type": "date_change",
  "new_amount": 32000,
  "action_taken": "refund",
  "reason": "Shortened stay by 1 night (July 3 checkout → July 2)"
}
```

- `previous_amount`는 서버에서 현재 registration의 `total_amount_cents` 기준으로 자동 설정
- `difference`는 서버에서 `new_amount - previous_amount`로 자동 계산
- `action_taken`이 `pending`이면 Stripe 처리 없이 기록만

**Response**: `{ "adjustment": { ... }, "success": true }`

### 4.3 POST /api/admin/registrations/[id]/adjustments/[adjustmentId]/process

Pending 상태의 adjustment에 대해 Stripe charge/refund 실행.

**Auth**: `requireAdmin()`

**Request Body**:
```json
{
  "action": "refund"
}
```

**Logic**:
- `action = "refund"`: 기존 `refund.service.ts`의 `createRefundWithGuard` 재사용
- `action = "charge"`: 새 Stripe PaymentIntent 생성 (기존 payment method 재사용 또는 admin manual)
- `action = "waive"`: action_taken을 `waive`로 업데이트, Stripe 처리 없음
- `action = "credit"`: action_taken을 `credit`으로 업데이트, Stripe 처리 없음
- 처리 후 audit log 기록

---

## 5. Initial Payment Integration

기존 결제 완료 flow에 `initial_payment` adjustment 자동 삽입을 추가한다.

### 5.1 삽입 위치

| Flow | File | Insertion Point |
|------|------|-----------------|
| User payment confirm | `src/app/api/payment/confirm/route.ts` | Registration status → PAID 업데이트 직후 |
| Admin manual registration | `src/app/api/admin/registration/route.ts` | Registration 생성 및 결제 완료 직후 |
| Admin manual payment | `src/app/api/admin/payment/manual/route.ts` | Payment 기록 및 status → PAID 직후 |

### 5.2 삽입 레코드

```typescript
await admin.from("eckcm_registration_adjustments").insert({
  registration_id: registrationId,
  adjustment_type: "initial_payment",
  previous_amount: 0,
  new_amount: totalAmountCents,
  difference: totalAmountCents,
  action_taken: "charge",
  stripe_payment_intent_id: stripePaymentIntentId ?? null,
  reason: "Initial registration payment",
  adjusted_by: userId,
  metadata: { source: "payment_confirm" },  // or "admin_registration", "admin_manual_payment"
});
```

### 5.3 Idempotency

- `payment/confirm` route는 이미 idempotent 패턴 사용 (ACH webhook 재호출 대비)
- initial_payment 삽입 전 기존 레코드 확인: `WHERE registration_id = ? AND adjustment_type = 'initial_payment'`
- 이미 존재하면 스킵

---

## 6. Admin UI

### 6.1 Registration Detail Sheet — "Adjustments" 탭 추가

기존 `registration-detail-sheet.tsx`의 Tabs에 세 번째 탭 추가:
- Overview | Participants | **Adjustments**

### 6.2 Adjustments Tab 구성

```
┌─────────────────────────────────────────────────┐
│  Adjustments                                     │
│                                                   │
│  ┌─ Summary Card ──────────────────────────────┐ │
│  │ Original: $350.00  Current: $320.00          │ │
│  │ Charged: $350.00   Refunded: $30.00          │ │
│  │ Net Balance: $320.00                         │ │
│  │ Pending: 0                                   │ │
│  └──────────────────────────────────────────────┘ │
│                                                   │
│  [+ New Adjustment]                               │
│                                                   │
│  ┌─ Ledger Table ──────────────────────────────┐ │
│  │ Date       │ Type         │ Diff    │ Action │ │
│  │ 06/15 10am │ Initial Pymt │ +$350   │ Charge │ │
│  │ 06/18 2pm  │ Date Change  │ -$30    │ Refund │ │
│  └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 6.3 New Adjustment Dialog

```
┌─────────────────────────────────────┐
│  New Adjustment                      │
│                                      │
│  Type: [Select ▾]                    │
│    date_change / option_change /     │
│    discount / admin_correction       │
│                                      │
│  New Total: [$ ______]               │
│  (Current: $350.00)                  │
│  Difference: -$30.00 (auto)          │
│                                      │
│  Action: [Select ▾]                  │
│    refund / charge / credit /        │
│    waive / pending                   │
│                                      │
│  Reason: [________________] *        │
│                                      │
│  [Cancel]  [Confirm Adjustment]      │
└─────────────────────────────────────┘
```

- Reason 필수 입력
- Difference 자동 계산 표시
- 확인 시 API 호출, 성공 시 toast + ledger 새로고침

### 6.4 Process Pending Dialog

Pending 상태 adjustment의 Action 컬럼에 "Process" 버튼 표시:
- 클릭 시 action 선택 (refund/charge/waive/credit)
- 확인 후 `/process` API 호출

---

## 7. Implementation Files

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | Supabase SQL (migration) | CREATE | `eckcm_registration_adjustments` 테이블 + RLS + indexes |
| 2 | `src/lib/types/database.ts` | MODIFY | AdjustmentType, AdjustmentAction 타입 추가 |
| 3 | `src/lib/services/adjustment.service.ts` | CREATE | Adjustment CRUD, summary 계산, initial_payment 삽입 |
| 4 | `src/app/api/admin/registrations/[id]/adjustments/route.ts` | CREATE | GET (목록) + POST (생성) |
| 5 | `src/app/api/admin/registrations/[id]/adjustments/[adjustmentId]/process/route.ts` | CREATE | POST (pending 처리) |
| 6 | `src/app/api/payment/confirm/route.ts` | MODIFY | initial_payment adjustment 자동 삽입 |
| 7 | `src/app/api/admin/registration/route.ts` | MODIFY | Admin 등록 시 initial_payment 삽입 |
| 8 | `src/app/api/admin/payment/manual/route.ts` | MODIFY | Manual payment 시 initial_payment 삽입 |
| 9 | `src/app/(admin)/admin/registrations/registration-detail-sheet.tsx` | MODIFY | Adjustments 탭 추가 |
| 10 | `src/lib/permissions.ts` | MODIFY | adjustment 관련 permission route 매핑 추가 |

---

## 8. Implementation Order

```
Phase 1: Data Layer
  1. SQL Migration (테이블 + RLS + indexes)
  2. TypeScript types 추가
  3. adjustment.service.ts 생성

Phase 2: API Layer
  4. GET/POST adjustments route
  5. POST process route
  6. Permission route 매핑

Phase 3: Initial Payment Integration
  7. payment/confirm route 수정
  8. admin/registration route 수정
  9. admin/payment/manual route 수정

Phase 4: Admin UI
  10. Adjustments 탭 + Summary + Ledger + Dialogs
```

---

## 9. Constraints & Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | 기존 `eckcm_refunds` 테이블 유지 | Stripe refund 추적은 payment 단위로 계속 필요. Adjustment는 비즈니스 레벨 overlay. |
| 2 | `total_amount_cents` 업데이트 정책 | Adjustment 생성 시 registration의 `total_amount_cents`도 `new_amount`로 업데이트 (running total 동기화) |
| 3 | Amount는 cents (INTEGER) | 기존 시스템과 동일한 통화 단위 (부동소수점 오류 방지) |
| 4 | `cancellation` type은 기존 cancel flow와 연동 | 취소 시 자동으로 cancellation adjustment 생성 (향후 확장) |
| 5 | RLS는 Admin only | 일반 사용자는 adjustment 정보에 접근 불가 (재무 데이터) |
| 6 | Metadata JSONB 활용 | 변경 상세 (어떤 날짜가 변경되었는지, 어떤 옵션이 추가/제거되었는지) 저장 |

---

## 10. Out of Scope (Future)

- 사용자 셀프서비스 변경 (현재는 관리자만 adjustment 생성 가능)
- 자동 가격 재계산 (날짜 변경 시 pricing.service.ts 연동하여 new_amount 자동 산출)
- Credit balance 관리 (크레딧 잔액 누적 및 차기 등록 시 적용)
- Adjustment 기반 PDF 영수증 재생성
- Bulk adjustment (다수 등록에 동시 할인 적용 등)
