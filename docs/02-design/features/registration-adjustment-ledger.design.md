# Design: Registration Adjustment Ledger

> Feature: `registration-adjustment-ledger`
> Created: 2026-03-24
> Plan Reference: [registration-adjustment-ledger.plan.md](../../01-plan/features/registration-adjustment-ledger.plan.md)
> Status: Draft
> Level: Dynamic (Next.js 16 + Supabase + Stripe)

---

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | Registration Adjustment Ledger |
| Created | 2026-03-24 |
| Files | 10 (3 new, 7 modified) |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| **Problem** | 등록 후 가격 변동 추적 불가, 관리자 수동 계산/처리 필요 |
| **Solution** | `eckcm_registration_adjustments` 테이블 기반 시간순 ledger + Stripe 통합 처리 |
| **Function UX Effect** | Admin 등록 상세 "Adjustments" 탭에서 이력/잔액 확인 및 원클릭 처리 |
| **Core Value** | 재무 투명성 및 감사 추적 확보 |

---

## 1. Database Design

### 1.1 Table: eckcm_registration_adjustments

```sql
CREATE TABLE eckcm_registration_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES eckcm_registrations(id) ON DELETE CASCADE,
  adjustment_type TEXT NOT NULL CHECK (
    adjustment_type IN (
      'initial_payment', 'date_change', 'option_change',
      'discount', 'cancellation', 'admin_correction'
    )
  ),
  previous_amount INTEGER NOT NULL,
  new_amount INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  action_taken TEXT NOT NULL CHECK (
    action_taken IN ('charge', 'refund', 'credit', 'waive', 'pending')
  ),
  stripe_payment_intent_id TEXT,
  stripe_refund_id TEXT,
  reason TEXT NOT NULL,
  adjusted_by UUID NOT NULL REFERENCES auth.users(id),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_reg_adj_registration_id ON eckcm_registration_adjustments(registration_id);
CREATE INDEX idx_reg_adj_created_at ON eckcm_registration_adjustments(created_at);
CREATE INDEX idx_reg_adj_type ON eckcm_registration_adjustments(adjustment_type);

-- RLS
ALTER TABLE eckcm_registration_adjustments ENABLE ROW LEVEL SECURITY;

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

### 1.2 Relationship to Existing Tables

```
eckcm_registrations (existing)
  │ id, total_amount_cents, status, event_id
  │
  ├── eckcm_invoices → eckcm_payments → eckcm_refunds   (기존 결제 layer — 유지)
  │
  └── eckcm_registration_adjustments (NEW)               (비즈니스 ledger layer)
        │ registration_id → registrations.id
        │ adjusted_by → auth.users.id
```

- `eckcm_refunds` 유지: Stripe refund 기록은 payment 단위로 계속 필요
- `registration_adjustments`는 상위 비즈니스 레벨 — "왜 금액이 변경되었는가" 추적
- `ON DELETE CASCADE`: registration 삭제 시 adjustments도 자동 삭제

---

## 2. TypeScript Types

### 2.1 File: `src/lib/types/database.ts` (MODIFY — append)

```typescript
export type AdjustmentType =
  | "initial_payment"
  | "date_change"
  | "option_change"
  | "discount"
  | "cancellation"
  | "admin_correction";

export type AdjustmentAction =
  | "charge"
  | "refund"
  | "credit"
  | "waive"
  | "pending";
```

### 2.2 File: `src/lib/services/adjustment.service.ts` (NEW)

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdjustmentType, AdjustmentAction } from "@/lib/types/database";

// ─── Interfaces ───

export interface AdjustmentRecord {
  id: string;
  registration_id: string;
  adjustment_type: AdjustmentType;
  previous_amount: number;
  new_amount: number;
  difference: number;
  action_taken: AdjustmentAction;
  stripe_payment_intent_id: string | null;
  stripe_refund_id: string | null;
  reason: string;
  adjusted_by: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdjustmentWithUser extends AdjustmentRecord {
  adjusted_by_name: string;
}

export interface AdjustmentSummary {
  original_amount: number;   // first adjustment's new_amount (initial_payment)
  current_amount: number;    // most recent adjustment's new_amount
  total_charged: number;     // sum of positive differences where action = charge
  total_refunded: number;    // sum of abs(negative differences) where action = refund
  total_waived: number;      // sum of abs(differences) where action = waive
  total_credited: number;    // sum of abs(differences) where action = credit
  net_balance: number;       // total_charged - total_refunded
  pending_count: number;     // count where action_taken = 'pending'
}

// ─── Functions ───

/**
 * Get all adjustments for a registration with adjuster name, ordered by created_at.
 */
export async function getAdjustments(
  admin: SupabaseClient,
  registrationId: string
): Promise<AdjustmentWithUser[]>;

/**
 * Calculate summary from adjustment records.
 */
export function calculateSummary(
  adjustments: AdjustmentRecord[]
): AdjustmentSummary;

/**
 * Get adjustments + summary in one call.
 */
export async function getAdjustmentsWithSummary(
  admin: SupabaseClient,
  registrationId: string
): Promise<{ adjustments: AdjustmentWithUser[]; summary: AdjustmentSummary }>;

/**
 * Insert initial_payment adjustment. Idempotent — skips if already exists.
 */
export async function insertInitialPayment(
  admin: SupabaseClient,
  params: {
    registrationId: string;
    totalAmountCents: number;
    stripePaymentIntentId?: string | null;
    adjustedBy: string;
    source: "payment_confirm" | "admin_registration" | "admin_manual_payment";
  }
): Promise<void>;

/**
 * Create a new adjustment and update registration total_amount_cents.
 */
export async function createAdjustment(
  admin: SupabaseClient,
  params: {
    registrationId: string;
    adjustmentType: AdjustmentType;
    newAmount: number;
    actionTaken: AdjustmentAction;
    reason: string;
    adjustedBy: string;
    metadata?: Record<string, unknown>;
    stripePaymentIntentId?: string;
    stripeRefundId?: string;
  }
): Promise<AdjustmentRecord>;

/**
 * Process a pending adjustment — update action_taken and Stripe IDs.
 */
export async function processAdjustment(
  admin: SupabaseClient,
  adjustmentId: string,
  params: {
    actionTaken: AdjustmentAction;
    stripePaymentIntentId?: string;
    stripeRefundId?: string;
  }
): Promise<void>;
```

---

## 3. Service Implementation Details

### 3.1 getAdjustments

```typescript
export async function getAdjustments(
  admin: SupabaseClient,
  registrationId: string
): Promise<AdjustmentWithUser[]> {
  const { data, error } = await admin
    .from("eckcm_registration_adjustments")
    .select(`
      id, registration_id, adjustment_type,
      previous_amount, new_amount, difference,
      action_taken, stripe_payment_intent_id, stripe_refund_id,
      reason, adjusted_by, metadata, created_at
    `)
    .eq("registration_id", registrationId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  // Batch-load adjuster names
  const userIds = [...new Set(data.map((a) => a.adjusted_by))];
  const { data: profiles } = await admin
    .from("eckcm_profiles")
    .select("id, display_name_en")
    .in("id", userIds);

  const nameMap = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name_en ?? "Unknown"])
  );

  return data.map((a) => ({
    ...a,
    adjusted_by_name: nameMap.get(a.adjusted_by) ?? "Unknown",
  }));
}
```

### 3.2 calculateSummary

```typescript
export function calculateSummary(
  adjustments: AdjustmentRecord[]
): AdjustmentSummary {
  if (adjustments.length === 0) {
    return {
      original_amount: 0, current_amount: 0,
      total_charged: 0, total_refunded: 0,
      total_waived: 0, total_credited: 0,
      net_balance: 0, pending_count: 0,
    };
  }

  const initial = adjustments.find((a) => a.adjustment_type === "initial_payment");
  const latest = adjustments[adjustments.length - 1];

  let total_charged = 0;
  let total_refunded = 0;
  let total_waived = 0;
  let total_credited = 0;
  let pending_count = 0;

  for (const adj of adjustments) {
    const absDiff = Math.abs(adj.difference);
    switch (adj.action_taken) {
      case "charge":
        total_charged += absDiff;
        break;
      case "refund":
        total_refunded += absDiff;
        break;
      case "waive":
        total_waived += absDiff;
        break;
      case "credit":
        total_credited += absDiff;
        break;
      case "pending":
        pending_count++;
        break;
    }
  }

  return {
    original_amount: initial?.new_amount ?? 0,
    current_amount: latest.new_amount,
    total_charged,
    total_refunded,
    total_waived,
    total_credited,
    net_balance: total_charged - total_refunded,
    pending_count,
  };
}
```

### 3.3 insertInitialPayment (Idempotent)

```typescript
export async function insertInitialPayment(
  admin: SupabaseClient,
  params: {
    registrationId: string;
    totalAmountCents: number;
    stripePaymentIntentId?: string | null;
    adjustedBy: string;
    source: "payment_confirm" | "admin_registration" | "admin_manual_payment";
  }
): Promise<void> {
  // Idempotency check
  const { data: existing } = await admin
    .from("eckcm_registration_adjustments")
    .select("id")
    .eq("registration_id", params.registrationId)
    .eq("adjustment_type", "initial_payment")
    .maybeSingle();

  if (existing) return; // Already recorded

  await admin.from("eckcm_registration_adjustments").insert({
    registration_id: params.registrationId,
    adjustment_type: "initial_payment",
    previous_amount: 0,
    new_amount: params.totalAmountCents,
    difference: params.totalAmountCents,
    action_taken: "charge",
    stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
    reason: "Initial registration payment",
    adjusted_by: params.adjustedBy,
    metadata: { source: params.source },
  });
}
```

### 3.4 createAdjustment

```typescript
export async function createAdjustment(
  admin: SupabaseClient,
  params: {
    registrationId: string;
    adjustmentType: AdjustmentType;
    newAmount: number;
    actionTaken: AdjustmentAction;
    reason: string;
    adjustedBy: string;
    metadata?: Record<string, unknown>;
    stripePaymentIntentId?: string;
    stripeRefundId?: string;
  }
): Promise<AdjustmentRecord> {
  // 1. Get current registration total
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("total_amount_cents")
    .eq("id", params.registrationId)
    .single();

  if (!reg) throw new Error("Registration not found");

  const previousAmount = reg.total_amount_cents;
  const difference = params.newAmount - previousAmount;

  // 2. Insert adjustment
  const { data: adjustment, error } = await admin
    .from("eckcm_registration_adjustments")
    .insert({
      registration_id: params.registrationId,
      adjustment_type: params.adjustmentType,
      previous_amount: previousAmount,
      new_amount: params.newAmount,
      difference,
      action_taken: params.actionTaken,
      stripe_payment_intent_id: params.stripePaymentIntentId ?? null,
      stripe_refund_id: params.stripeRefundId ?? null,
      reason: params.reason,
      adjusted_by: params.adjustedBy,
      metadata: params.metadata ?? {},
    })
    .select()
    .single();

  if (error || !adjustment) {
    throw new Error(`Failed to create adjustment: ${error?.message}`);
  }

  // 3. Update registration total_amount_cents
  await admin
    .from("eckcm_registrations")
    .update({ total_amount_cents: params.newAmount })
    .eq("id", params.registrationId);

  return adjustment;
}
```

---

## 4. API Routes

### 4.1 GET & POST: `src/app/api/admin/registrations/[id]/adjustments/route.ts` (NEW)

```typescript
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAuditLog } from "@/lib/services/audit.service";
import {
  getAdjustmentsWithSummary,
  createAdjustment,
} from "@/lib/services/adjustment.service";
import type { AdjustmentType, AdjustmentAction } from "@/lib/types/database";

// ─── GET: List adjustments ───
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: registrationId } = await params;
  const admin = createAdminClient();

  const result = await getAdjustmentsWithSummary(admin, registrationId);
  return NextResponse.json(result);
}

// ─── POST: Create adjustment ───

const VALID_TYPES: AdjustmentType[] = [
  "date_change", "option_change", "discount",
  "cancellation", "admin_correction",
];
const VALID_ACTIONS: AdjustmentAction[] = [
  "charge", "refund", "credit", "waive", "pending",
];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { user } = auth;
  const { id: registrationId } = await params;

  const body = await request.json();
  const { adjustment_type, new_amount, action_taken, reason, metadata } = body;

  // Validation
  if (!VALID_TYPES.includes(adjustment_type)) {
    return NextResponse.json(
      { error: `Invalid adjustment_type. Must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (!VALID_ACTIONS.includes(action_taken)) {
    return NextResponse.json(
      { error: `Invalid action_taken. Must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }
  if (typeof new_amount !== "number" || !Number.isInteger(new_amount) || new_amount < 0) {
    return NextResponse.json(
      { error: "new_amount must be a non-negative integer (cents)" },
      { status: 400 }
    );
  }
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return NextResponse.json(
      { error: "reason is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify registration exists
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("id, event_id")
    .eq("id", registrationId)
    .single();

  if (!reg) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  const adjustment = await createAdjustment(admin, {
    registrationId,
    adjustmentType: adjustment_type,
    newAmount: new_amount,
    actionTaken: action_taken,
    reason: reason.trim(),
    adjustedBy: user.id,
    metadata: metadata ?? {},
  });

  // Audit log
  await writeAuditLog(admin, {
    event_id: reg.event_id,
    user_id: user.id,
    action: "ADMIN_ADJUSTMENT_CREATED",
    entity_type: "registration",
    entity_id: registrationId,
    new_data: {
      adjustment_id: adjustment.id,
      adjustment_type,
      previous_amount: adjustment.previous_amount,
      new_amount: adjustment.new_amount,
      difference: adjustment.difference,
      action_taken,
      reason: reason.trim(),
    },
  });

  return NextResponse.json({ adjustment, success: true });
}
```

### 4.2 POST: `src/app/api/admin/registrations/[id]/adjustments/[adjustmentId]/process/route.ts` (NEW)

```typescript
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { getStripeForMode } from "@/lib/stripe/config";
import { createRefundWithGuard } from "@/lib/services/refund.service";
import { processAdjustment } from "@/lib/services/adjustment.service";
import { writeAuditLog } from "@/lib/services/audit.service";
import { logger } from "@/lib/logger";
import type { AdjustmentAction } from "@/lib/types/database";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; adjustmentId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { user } = auth;
  const { id: registrationId, adjustmentId } = await params;

  const body = await request.json();
  const action: AdjustmentAction = body.action;

  if (!["charge", "refund", "waive", "credit"].includes(action)) {
    return NextResponse.json(
      { error: "action must be one of: charge, refund, waive, credit" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1. Load adjustment
  const { data: adj } = await admin
    .from("eckcm_registration_adjustments")
    .select("*")
    .eq("id", adjustmentId)
    .eq("registration_id", registrationId)
    .single();

  if (!adj) {
    return NextResponse.json({ error: "Adjustment not found" }, { status: 404 });
  }
  if (adj.action_taken !== "pending") {
    return NextResponse.json(
      { error: `Adjustment already processed: ${adj.action_taken}` },
      { status: 400 }
    );
  }

  // 2. Resolve event's Stripe mode
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("event_id, eckcm_events!inner(stripe_mode)")
    .eq("id", registrationId)
    .single();

  const eventId = reg?.event_id ?? null;
  const events = reg?.eckcm_events as unknown as { stripe_mode: string } | null;
  const stripeMode = (events?.stripe_mode as "test" | "live") ?? "test";

  let stripePaymentIntentId: string | undefined;
  let stripeRefundId: string | undefined;

  // 3. Execute Stripe operations based on action
  if (action === "refund" && adj.difference < 0) {
    // Find the most recent SUCCEEDED payment for this registration
    const { data: payment } = await admin
      .from("eckcm_payments")
      .select("id, stripe_payment_intent_id, amount_cents, status, invoice_id")
      .eq("status", "SUCCEEDED")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    // Note: payment lookup via invoice → registration join required
    // (simplified here; actual implementation joins through invoices)

    if (payment?.stripe_payment_intent_id) {
      const stripe = await getStripeForMode(stripeMode);
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        amount: Math.abs(adj.difference),
        reason: "requested_by_customer",
      });
      stripeRefundId = refund.id;

      await createRefundWithGuard(admin, {
        paymentId: payment.id,
        paymentAmountCents: payment.amount_cents,
        amountCents: Math.abs(adj.difference),
        stripeRefundId: refund.id,
        reason: adj.reason,
        refundedBy: user.id,
      });
    }
  }

  // charge action: record as admin manual payment (no new Stripe PI for now)
  // waive/credit: no Stripe action needed

  // 4. Update adjustment record
  await processAdjustment(admin, adjustmentId, {
    actionTaken: action,
    stripePaymentIntentId,
    stripeRefundId,
  });

  // 5. Audit log
  await writeAuditLog(admin, {
    event_id: eventId,
    user_id: user.id,
    action: "ADMIN_ADJUSTMENT_PROCESSED",
    entity_type: "registration",
    entity_id: registrationId,
    new_data: {
      adjustment_id: adjustmentId,
      action,
      difference: adj.difference,
      stripe_refund_id: stripeRefundId ?? null,
    },
  });

  return NextResponse.json({ success: true, action });
}
```

---

## 5. Initial Payment Integration (Existing Route Modifications)

### 5.1 `src/app/api/payment/confirm/route.ts` (MODIFY)

**Import to add** (top of file):
```typescript
import { insertInitialPayment } from "@/lib/services/adjustment.service";
```

**Insertion point**: After `registration.status → PAID` update succeeds (line ~170), before E-Pass generation.

```typescript
// After: registrationUpdate succeeds (line ~181)
// Before: Update payment and invoice (line ~184)

// ── Insert initial_payment adjustment (idempotent) ──
await insertInitialPayment(admin, {
  registrationId,
  totalAmountCents: paymentIntent.amount ?? 0,
  stripePaymentIntentId: paymentIntentId,
  adjustedBy: user.id,
  source: "payment_confirm",
});
```

**ACH case**: No adjustment inserted during `processing` status. The initial_payment is inserted when the Stripe webhook confirms payment (via the idempotent confirm route).

### 5.2 `src/app/api/admin/registration/route.ts` (MODIFY)

**Import to add**:
```typescript
import { insertInitialPayment } from "@/lib/services/adjustment.service";
```

**Insertion point**: After invoice + payment record creation (line ~475), before confirmation email.

```typescript
// After: payment record insert (line ~475)
// Before: Send confirmation email (line ~480)

// ── Insert initial_payment adjustment ──
await insertInitialPayment(admin, {
  registrationId: registration.id,
  totalAmountCents: estimate.total,
  stripePaymentIntentId: null,
  adjustedBy: user.id,
  source: "admin_registration",
});
```

### 5.3 `src/app/api/admin/payment/manual/route.ts` (MODIFY)

**Import to add**:
```typescript
import { insertInitialPayment } from "@/lib/services/adjustment.service";
```

**Insertion point**: After registration status → PAID update (line ~126), before confirmation code generation.

```typescript
// After: registration status = PAID (line ~126)
// Before: Generate confirmation code (line ~129)

// ── Insert initial_payment adjustment ──
await insertInitialPayment(admin, {
  registrationId: registration.id,
  totalAmountCents: invoice.total_cents,
  stripePaymentIntentId: null,
  adjustedBy: user.id,
  source: "admin_manual_payment",
});
```

---

## 6. Permission Route Mapping

### 6.1 `src/lib/permissions.ts` (MODIFY)

Add adjustment permission route before the general registrations entry:

```typescript
// Existing (line 4):
["/admin/registrations/create", "participant.update"],

// ADD after line 4:
["/admin/registrations/adjustments", "participant.update"],
```

> Uses existing `participant.update` permission — no new permission code needed. Only SUPER_ADMIN and EVENT_ADMIN have this permission, matching the RLS policy.

---

## 7. Admin UI Design

### 7.1 Registration Detail Sheet Tabs (MODIFY)

**File**: `src/app/(admin)/admin/registrations/registration-detail-sheet.tsx`

Add third tab to existing `<TabsList>`:

```tsx
<TabsList className="w-full">
  <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
  <TabsTrigger value="participants" className="flex-1">
    Participants ({reg.people_count})
  </TabsTrigger>
  <TabsTrigger value="adjustments" className="flex-1">Adjustments</TabsTrigger>
</TabsList>
```

### 7.2 Adjustments Tab Content

```tsx
<TabsContent value="adjustments" className="mt-4">
  <AdjustmentsPanel
    registrationId={reg.id}
    currentAmount={reg.total_amount_cents}
    onAdjustmentCreated={onRefresh}
  />
</TabsContent>
```

### 7.3 AdjustmentsPanel Component (separate within same file or co-located)

**State**:
```typescript
const [adjustments, setAdjustments] = useState<AdjustmentWithUser[]>([]);
const [summary, setSummary] = useState<AdjustmentSummary | null>(null);
const [loading, setLoading] = useState(true);
const [showNewDialog, setShowNewDialog] = useState(false);
```

**Layout**:
```
┌─────────────────────────────────────────────────────────┐
│ Summary Card                                             │
│ ┌──────────┬──────────┬──────────┬──────────┐           │
│ │ Original │ Current  │ Charged  │ Refunded │           │
│ │ $350.00  │ $320.00  │ $350.00  │ $30.00   │           │
│ └──────────┴──────────┴──────────┴──────────┘           │
│ Net Balance: $320.00   Pending: 0                        │
├─────────────────────────────────────────────────────────┤
│ [+ New Adjustment]                                       │
├─────────────────────────────────────────────────────────┤
│ Ledger Table                                             │
│ ┌──────────┬────────────┬───────┬────────┬──────┬─────┐ │
│ │ Date     │ Type       │ Diff  │ Action │ By   │     │ │
│ ├──────────┼────────────┼───────┼────────┼──────┼─────┤ │
│ │ 06/15    │ Initial    │ +$350 │ Charge │ John │     │ │
│ │ 06/18    │ Date Chg   │ -$30  │ Refund │ Jane │     │ │
│ │ 06/20    │ Discount   │ -$20  │Pending │ Jane │[▶]  │ │
│ └──────────┴────────────┴───────┴────────┴──────┴─────┘ │
└─────────────────────────────────────────────────────────┘
```

### 7.4 Summary Card

Uses Shadcn `Card` component:

```tsx
<div className="grid grid-cols-4 gap-3 mb-4">
  <div className="rounded-lg border p-3 text-center">
    <p className="text-lg font-bold">{formatMoney(summary.original_amount)}</p>
    <p className="text-xs text-muted-foreground">Original</p>
  </div>
  <div className="rounded-lg border p-3 text-center">
    <p className="text-lg font-bold">{formatMoney(summary.current_amount)}</p>
    <p className="text-xs text-muted-foreground">Current</p>
  </div>
  <div className="rounded-lg border p-3 text-center">
    <p className="text-lg font-bold text-green-600">
      {formatMoney(summary.total_charged)}
    </p>
    <p className="text-xs text-muted-foreground">Charged</p>
  </div>
  <div className="rounded-lg border p-3 text-center">
    <p className="text-lg font-bold text-red-600">
      {formatMoney(summary.total_refunded)}
    </p>
    <p className="text-xs text-muted-foreground">Refunded</p>
  </div>
</div>
```

### 7.5 Ledger Table

Using existing `Table` components (same pattern as participants table):

| Column | Source | Display |
|--------|--------|---------|
| Date | `created_at` | `formatTimestamp()` |
| Type | `adjustment_type` | Badge with label mapping |
| Previous | `previous_amount` | `formatMoney()`, text-muted |
| New | `new_amount` | `formatMoney()` |
| Diff | `difference` | `+$X / -$X`, green/red color |
| Action | `action_taken` | Badge (charge=default, refund=destructive, pending=outline) |
| By | `adjusted_by_name` | truncated name |
| Actions | — | "Process" button if pending |

**Type label mapping**:
```typescript
const TYPE_LABELS: Record<AdjustmentType, string> = {
  initial_payment: "Initial Payment",
  date_change: "Date Change",
  option_change: "Option Change",
  discount: "Discount",
  cancellation: "Cancellation",
  admin_correction: "Correction",
};
```

**Action badge variants** (reusing existing `statusVariant` pattern):
```typescript
const ACTION_VARIANTS: Record<AdjustmentAction, "default" | "destructive" | "outline" | "secondary"> = {
  charge: "default",
  refund: "destructive",
  credit: "secondary",
  waive: "secondary",
  pending: "outline",
};
```

### 7.6 New Adjustment Dialog

Uses Shadcn `AlertDialog`:

```tsx
<AlertDialog open={showNewDialog} onOpenChange={setShowNewDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>New Adjustment</AlertDialogTitle>
      <AlertDialogDescription>
        Create a price adjustment for this registration.
      </AlertDialogDescription>
    </AlertDialogHeader>

    {/* Type Select */}
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Type</label>
        <Select value={newType} onValueChange={setNewType}>
          {/* date_change, option_change, discount, admin_correction */}
        </Select>
      </div>

      {/* New Total Input */}
      <div>
        <label className="text-sm font-medium">New Total (cents)</label>
        <Input type="number" value={newAmount} onChange={...} />
        <p className="text-xs text-muted-foreground mt-1">
          Current: {formatMoney(currentAmount)}
          {' → '}Difference: {formatDifference(newAmount - currentAmount)}
        </p>
      </div>

      {/* Action Select */}
      <div>
        <label className="text-sm font-medium">Action</label>
        <Select value={newAction} onValueChange={setNewAction}>
          {/* refund, charge, credit, waive, pending */}
        </Select>
      </div>

      {/* Reason (required) */}
      <div>
        <label className="text-sm font-medium">Reason *</label>
        <Textarea value={reason} onChange={...} />
      </div>
    </div>

    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleCreateAdjustment}
        disabled={!reason.trim() || submitting}
      >
        Confirm Adjustment
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 7.7 Process Pending Dialog

For pending adjustments, show "Process" button in the Actions column:

```tsx
{adj.action_taken === "pending" && (
  <Button
    size="sm"
    variant="outline"
    onClick={() => setProcessingAdj(adj)}
  >
    Process
  </Button>
)}
```

Process dialog: Select action (refund/charge/waive/credit) → Confirm → POST to `/process` endpoint.

---

## 8. Data Flow Diagrams

### 8.1 Initial Payment Flow

```
User pays (Card/Wallet)
  → POST /api/payment/confirm
  → Registration status → PAID
  → insertInitialPayment()     ← NEW
    → Check existing (idempotent)
    → INSERT eckcm_registration_adjustments
  → Generate E-Pass, send email
```

### 8.2 Admin Creates Adjustment

```
Admin clicks "+ New Adjustment"
  → Fill form (type, new_amount, action, reason)
  → POST /api/admin/registrations/[id]/adjustments
  → createAdjustment()
    → Read current total_amount_cents
    → Calculate difference
    → INSERT adjustment record
    → UPDATE registration.total_amount_cents
  → writeAuditLog()
  → UI refreshes ledger table + summary
```

### 8.3 Process Pending Adjustment

```
Admin clicks "Process" on pending adjustment
  → Select action (refund/charge/waive/credit)
  → POST /api/admin/.../adjustments/[adjustmentId]/process
  → If refund:
    → getStripeForMode()
    → stripe.refunds.create()
    → createRefundWithGuard()
  → processAdjustment() → UPDATE action_taken, stripe IDs
  → writeAuditLog()
```

---

## 9. Implementation Checklist

```
Phase 1: Data Layer
  [ ] 1. Run SQL migration in Supabase (table + RLS + indexes)
  [ ] 2. Add AdjustmentType, AdjustmentAction to src/lib/types/database.ts
  [ ] 3. Create src/lib/services/adjustment.service.ts

Phase 2: API Layer
  [ ] 4. Create src/app/api/admin/registrations/[id]/adjustments/route.ts (GET+POST)
  [ ] 5. Create src/app/api/admin/registrations/[id]/adjustments/[adjustmentId]/process/route.ts
  [ ] 6. Add permission route to src/lib/permissions.ts

Phase 3: Initial Payment Integration
  [ ] 7. Modify src/app/api/payment/confirm/route.ts (add insertInitialPayment)
  [ ] 8. Modify src/app/api/admin/registration/route.ts (add insertInitialPayment)
  [ ] 9. Modify src/app/api/admin/payment/manual/route.ts (add insertInitialPayment)

Phase 4: Admin UI
  [ ] 10. Add Adjustments tab + AdjustmentsPanel to registration-detail-sheet.tsx
```

---

## 10. Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| Duplicate initial_payment | Idempotency check — skip if exists |
| Concurrent adjustments | Last-write-wins on total_amount_cents (acceptable for admin-only) |
| Stripe refund fails | Return 500, adjustment stays pending, admin can retry |
| Registration deleted | CASCADE deletes all adjustments |
| Zero-difference adjustment | Allowed (e.g., waive or correction with same total) |
| Negative new_amount | Rejected by validation (must be >= 0) |
| Pending → Pending | Rejected — must choose charge/refund/waive/credit |

---

## 11. Audit Log Actions

| Action Code | Trigger | Entity |
|-------------|---------|--------|
| `ADMIN_ADJUSTMENT_CREATED` | New adjustment via POST | registration |
| `ADMIN_ADJUSTMENT_PROCESSED` | Pending adjustment processed | registration |

**new_data** includes: `adjustment_id`, `adjustment_type`, `difference`, `action_taken`, `reason`, `stripe_refund_id` (if applicable).
