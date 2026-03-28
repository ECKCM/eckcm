# Design: Payment Complete

> Feature: `payment-complete`
> Created: 2026-03-27
> Plan Reference: N/A (retroactive design from existing implementation)
> Status: Retroactive
> Level: Dynamic (Next.js 16 + Supabase + Stripe)

---

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | Payment Complete — Full payment lifecycle |
| Created | 2026-03-27 |
| Files | 25+ (API routes, pages, services, types) |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| **Problem** | Registration requires payment via multiple methods (card, Zelle, check) with consistent status tracking and admin confirmation flows |
| **Solution** | Stripe PaymentIntent-based card payments + manual payment submission with admin confirmation, unified via Invoice/Payment/Adjustment ledger |
| **Function UX Effect** | Users select payment method, complete payment inline, receive E-Pass immediately (card) or after admin confirmation (Zelle/check) |
| **Core Value** | Reliable multi-method payment collection with financial audit trail and idempotent processing |

---

## 1. Database Design

### 1.1 Table: eckcm_payments

```sql
CREATE TABLE eckcm_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES eckcm_invoices(id),
  stripe_payment_intent_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL CHECK (
    status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED')
  ),
  method TEXT NOT NULL CHECK (
    method IN ('CARD', 'APPLE_PAY', 'GOOGLE_PAY', 'CHECK', 'ZELLE', 'MANUAL')
  ),
  cover_fees BOOLEAN NOT NULL DEFAULT false,
  fee_amount_cents INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.2 Table: eckcm_invoices

```sql
CREATE TABLE eckcm_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES eckcm_registrations(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('DRAFT', 'SENT', 'PAID', 'VOID')
  ) DEFAULT 'DRAFT',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.3 Table: eckcm_invoice_line_items

```sql
CREATE TABLE eckcm_invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES eckcm_invoices(id) ON DELETE CASCADE,
  description_en TEXT NOT NULL,
  description_ko TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  fee_category_id UUID REFERENCES eckcm_fee_categories(id),
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

### 1.4 Table: eckcm_refunds

```sql
CREATE TABLE eckcm_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES eckcm_payments(id),
  stripe_refund_id TEXT,
  amount_cents INTEGER NOT NULL,
  reason TEXT,
  refunded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.5 Relationship to Existing Tables

```
eckcm_registrations (1) ──→ (N) eckcm_invoices
eckcm_invoices      (1) ──→ (N) eckcm_invoice_line_items
eckcm_invoices      (1) ──→ (N) eckcm_payments
eckcm_payments      (1) ──→ (N) eckcm_refunds
eckcm_registrations (1) ──→ (N) eckcm_registration_adjustments
eckcm_registrations (1) ──→ (N) eckcm_epass_tokens
```

### 1.6 Configuration: eckcm_app_config

Payment-related fields in the shared config row:
- `enabled_payment_methods`: JSON array (e.g. `["card", "zelle", "check", "wallet"]`)
- `donor_covers_fees_registration`: Boolean
- `stripe_test_secret_key`, `stripe_live_secret_key`: Stripe API keys
- `stripe_test_publishable_key`, `stripe_live_publishable_key`: Client keys
- `stripe_test_webhook_secret`, `stripe_live_webhook_secret`: Webhook signing secrets

Event-level config (`eckcm_events`):
- `stripe_mode`: `"test"` | `"live"`
- `payment_test_mode`: Boolean (charge $1 instead of actual amount)

---

## 2. API Design

### 2.1 Payment Info (Pre-Intent)

```
POST /api/payment/info
Body: { registrationId }
Response: {
  amount, baseAmount, invoiceTotal,
  manualPaymentDiscount, freeRegistration,
  registrantName, registrantPhone, registrantEmail,
  paymentTestMode
}
```

- Loads latest non-REFUNDED invoice
- Calculates manual payment discount from MANUAL_PAYMENT_DISCOUNT fee category
- Discount = discountPerPerson * billableParticipantCount
- If `payment_test_mode`: amount = 100 cents ($1.00)

### 2.2 Create PaymentIntent (Stripe)

```
POST /api/payment/create-intent
Body: { registrationId, coversFees }
Response: { clientSecret, paymentIntentId, amount, feeAmount }
```

- Idempotent: reuses existing PENDING PaymentIntent if available
- Creates/reuses Stripe Customer by email
- Fee calculation: `ceil((baseCents + 30) / 0.971)`
- Payment method types: `["card", "amazon_pay"]`
- Creates PENDING payment record in DB
- Metadata: registrationId, invoiceId, userId, confirmationCode, coversFees

### 2.3 Confirm Payment (Post-Stripe)

```
POST /api/payment/confirm
Body: { paymentIntentId, registrationId }
```

Idempotent endpoint called after Stripe payment succeeds:
1. Verify payment status with Stripe API
2. Update `eckcm_registrations.status` → PAID
3. Insert `initial_payment` adjustment record
4. Update `eckcm_payments.status` → SUCCEEDED
5. Update `eckcm_invoices.status` → SUCCEEDED, set `paid_at`
6. Generate E-Pass tokens (is_active: **true**)
7. Send confirmation email (async via `after()`)
8. Recalculate inventory counts
9. Sync to Google Sheets

### 2.4 Zelle Submit

```
POST /api/payment/zelle-submit
Body: { registrationId }
```

1. Calculate manual payment discount
2. Apply discount as negative invoice line item
3. Cancel any orphaned Stripe PaymentIntents
4. Create ZELLE payment record (status: PENDING)
5. Update registration status → SUBMITTED
6. Generate E-Pass tokens (is_active: **false**)
7. Send Zelle instructions email
8. Create audit log: `ZELLE_PAYMENT_SUBMITTED`

### 2.5 Check Submit

```
POST /api/payment/check-submit
Body: { registrationId }
```

Same flow as Zelle with method CHECK and check-specific instructions email.
Audit log: `CHECK_PAYMENT_SUBMITTED`

### 2.6 Update Cover Fees

```
POST /api/payment/update-cover-fees
Body: { paymentIntentId, coversFees, registrationId }
```

Recalculates charge amount with/without processing fees. Updates Stripe PI and DB record.

### 2.7 Update Method Discount

```
POST /api/payment/update-method-discount
Body: { paymentIntentId, registrationId, selectedMethod }
```

Handles switching between card/amazon_pay payment methods within Stripe.

### 2.8 Cancel Intent

```
POST /api/payment/cancel-intent
Body: { paymentIntentId }
```

Called on page unload (`navigator.sendBeacon`). Cancels Stripe PI and deletes DB payment record.

### 2.9 Retrieve Intent

```
POST /api/payment/retrieve-intent
Body: { paymentIntentId }
Response: { status, registrationId, confirmationCode }
```

Used by payment-complete page to verify payment status from Stripe metadata.

### 2.10 Payment Methods Config

```
GET /api/payment/methods
Response: { enabled: string[], donorCoversFees: boolean }
```

Returns from `eckcm_app_config`.

### 2.11 Admin Manual Payment

```
POST /api/admin/payment/manual
Body: { registrationId, method, amount_cents?, notes? }
Auth: Admin role required
```

1. Upsert payment record with status: SUCCEEDED
2. Update invoice and registration → PAID
3. Insert `initial_payment` adjustment
4. Generate confirmation code if missing
5. Activate all inactive E-Pass tokens
6. Send receipt-only PDF email
7. Create audit log: `ADMIN_MANUAL_PAYMENT`

---

## 3. Stripe Integration

### 3.1 Configuration

```typescript
// Server-side: mode-specific Stripe instance
getStripeForMode(mode: "test" | "live"): Stripe

// Client-side: publishable key per event
getStripeWithKey(publishableKey: string): Promise<Stripe>
```

Keys loaded from `eckcm_app_config` based on event's `stripe_mode`.

### 3.2 PaymentIntent Metadata

```json
{
  "registrationId": "uuid",
  "invoiceId": "uuid",
  "userId": "user-id",
  "confirmationCode": "ECKCM-XXXX",
  "coversFees": "true|false",
  "type": "registration",
  "selectedPaymentMethod": "card|amazon_pay"
}
```

### 3.3 Webhook Handler

```
POST /api/stripe/webhook
Event: payment_intent.succeeded
```

- Validates Stripe signature
- Handles both registration and donation payment types
- Idempotent: checks if registration already PAID before processing
- Same finalization logic as `/api/payment/confirm`

### 3.4 Fee Calculation

```
chargeAmount = ceil((baseCents + 30) / (1 - 0.029))
             = ceil((baseCents + 30) / 0.971)

Example: $100 base → $103.30 charge ($3.30 fee)
```

---

## 4. User Flow Design

### 4.1 Card Payment (Immediate)

```
Registration Wizard Step 8: Payment
  → GET /api/payment/methods (load enabled methods)
  → POST /api/payment/info (load amounts, no PI created)
  → User selects "Card/Wallet"
  → POST /api/payment/create-intent (lazy PI creation)
  → Stripe Elements renders (PaymentElement + ExpressCheckoutElement)
  → Optional: toggle "Cover Processing Fees"
  → User submits card → Stripe confirms
  → Redirect to /register/payment-complete?payment_intent=pi_xxx
  → POST /api/payment/retrieve-intent (verify status)
  → POST /api/payment/confirm (finalize)
  → Redirect to confirmation page with E-Pass
```

### 4.2 Zelle/Check (Deferred)

```
Registration Wizard Step 8: Payment
  → User selects "Zelle" or "Check"
  → Shows manual payment discount amount
  → User confirms submission
  → POST /api/payment/zelle-submit or /check-submit
  → Redirect to confirmation page (status: SUBMITTED)
  → User receives instructions email
  → Admin later confirms via /api/admin/payment/manual
  → E-Pass tokens activated
```

### 4.3 Payment-Complete Page

```
/register/payment-complete?payment_intent=pi_xxx&payment_intent_client_secret=xxx
  → Extract payment_intent from URL params
  → POST /api/payment/retrieve-intent
  → If succeeded/processing → POST /api/payment/confirm
  → Generate E-Pass token display
  → Show confirmation with registration details
  → Send email confirmation
```

### 4.4 Orphan Cleanup

```
beforeunload event on payment page:
  → navigator.sendBeacon(/api/payment/cancel-intent)
  → Cancels Stripe PI + deletes DB payment record
```

---

## 5. Component Design

### 5.1 Payment Page (`register/[eventId]/payment/page.tsx`)

```
PaymentPage
├── Order Summary Card
│   ├── Line items from invoice
│   ├── Manual payment discount (if applicable)
│   └── Total amount
├── Payment Method Selector
│   ├── Stripe Card/Wallet tab
│   │   ├── PaymentElement (card input)
│   │   ├── ExpressCheckoutElement (Apple/Google/Amazon Pay)
│   │   └── Cover Fees Toggle
│   ├── Zelle tab
│   │   └── Zelle submission form
│   └── Check tab
│       └── Check submission form
└── Processing Overlay (during submission)
```

### 5.2 Payment Complete Page (`register/payment-complete/page.tsx`)

```
PaymentCompletePage
├── Loading state (verifying payment)
├── Success state
│   ├── Confirmation code display
│   ├── E-Pass preview
│   └── "View Registration" link
└── Error state (payment failed/expired)
```

---

## 6. Email Notifications

| Trigger | Template | Content |
|---------|----------|---------|
| Card payment confirmed | confirmation email | E-Pass + receipt PDF |
| Zelle submitted | Zelle instructions | Payment instructions + reference info |
| Check submitted | Check instructions | Mailing address + payee info |
| Admin manual payment | Receipt-only PDF | Payment confirmation receipt |

All emails sent asynchronously via `after()` to avoid blocking the response.

---

## 7. Audit & Logging

### 7.1 Audit Log Entries

| Action | Table | Data |
|--------|-------|------|
| `CHECK_PAYMENT_SUBMITTED` | `eckcm_audit_logs` | amount, discount, method, epass count |
| `ZELLE_PAYMENT_SUBMITTED` | `eckcm_audit_logs` | amount, discount, method, epass count |
| `ADMIN_MANUAL_PAYMENT` | `eckcm_audit_logs` | amount, method, notes |

### 7.2 Adjustment Ledger

Initial payment recorded in `eckcm_registration_adjustments`:
- `adjustment_type`: `initial_payment`
- `previous_amount`: 0
- `new_amount`: paid amount
- `difference`: paid amount
- `action_taken`: `charge`

---

## 8. Idempotency & Error Handling

| Endpoint | Idempotency Strategy |
|----------|---------------------|
| `create-intent` | Reuse existing PENDING PaymentIntent for same registration |
| `confirm` | Check if registration already PAID before processing |
| `zelle-submit` / `check-submit` | Check registration status before submission |
| `admin/payment/manual` | Upsert payment, check existing adjustments |
| Stripe webhook | Check payment/registration status before updating |

---

## 9. Implementation Files

### 9.1 API Routes

| File | Purpose |
|------|---------|
| `src/app/api/payment/info/route.ts` | Load payment info (no PI) |
| `src/app/api/payment/create-intent/route.ts` | Create Stripe PaymentIntent |
| `src/app/api/payment/confirm/route.ts` | Finalize card payment |
| `src/app/api/payment/zelle-submit/route.ts` | Submit Zelle payment |
| `src/app/api/payment/check-submit/route.ts` | Submit check payment |
| `src/app/api/payment/update-cover-fees/route.ts` | Toggle fee coverage |
| `src/app/api/payment/update-method-discount/route.ts` | Switch payment method |
| `src/app/api/payment/cancel-intent/route.ts` | Cancel orphaned PI |
| `src/app/api/payment/retrieve-intent/route.ts` | Retrieve PI status |
| `src/app/api/payment/methods/route.ts` | Get payment config |
| `src/app/api/admin/payment/manual/route.ts` | Admin manual payment |
| `src/app/api/stripe/webhook/route.ts` | Stripe webhook handler |

### 9.2 Pages

| File | Purpose |
|------|---------|
| `src/app/(protected)/register/[eventId]/payment/page.tsx` | Payment step (wizard) |
| `src/app/(protected)/register/payment-complete/page.tsx` | Post-Stripe redirect |

### 9.3 Services

| File | Purpose |
|------|---------|
| `src/lib/stripe/config.ts` | Stripe server instance (mode-aware) |
| `src/lib/stripe/client.ts` | Stripe.js client loader |
| `src/lib/services/pricing.service.ts` | Price estimation and fee calculation |
| `src/lib/services/funding.service.ts` | Funding allocation |
| `src/lib/services/epass.service.ts` | E-Pass token generation |

### 9.4 Types

| File | Purpose |
|------|---------|
| `src/lib/types/payment.ts` | Payment, Invoice, Refund interfaces |

---

## 10. Security Considerations

- All payment API routes require authenticated user (Supabase auth)
- Admin payment route requires admin role verification
- Stripe webhook validates signature before processing
- PaymentIntent metadata ties payment to specific registration/user
- RLS policies on payment tables restrict access
- `navigator.sendBeacon` for cleanup uses POST (no CSRF risk for cancellation)
- Manual payment discount calculated server-side only (no client manipulation)
