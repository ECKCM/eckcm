# Design: SUBMITTED Card Payment Link

> Feature: `submitted-card-payment-link` (extension of `payment-complete`)
> Created: 2026-05-29
> Plan Reference: ad-hoc (operational need — many SUBMITTED registrants want to pay by card)
> Status: Draft (pending review before implementation)
> Level: Dynamic (Next.js 16 + Supabase + Stripe **LIVE**)

---

## Executive Summary

| Item | Detail |
|------|--------|
| Feature | Let a **SUBMITTED** registration (Zelle/Check) pay by **card** via a secure self-service link |
| Trigger | Admin clicks "카드 결제 링크 생성" on the registration detail sheet |
| Result | Registrant opens link (no login) → pays by card → `SUBMITTED → PAID`, E-Pass activated |
| Money rule | Card = **full price** (manual-payment discount removed) |
| Blast radius | **Additive only.** New files + 1 admin button + 4 token columns. Existing card/Zelle/Check flows untouched. |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| **Problem** | Card payment is wired only for `DRAFT` (immediate `DRAFT → PAID`). Registrants who already submitted via Zelle/Check are stuck in `SUBMITTED` with no card path — and "부지기수" of them want to pay by card. |
| **Solution** | Admin generates a per-registration secure payment link; registrant pays by card on a public page; backend recalculates to card list price, supersedes the pending manual payment, and atomically finalizes `SUBMITTED → PAID`. |
| **Function UX Effect** | Admin issues a link in one click and can bulk-send; registrant pays without an account; E-Pass activates automatically. |
| **Core Value** | Captures card-preferring revenue that is currently blocked, without weakening the LIVE payment ledger's safety guarantees. |

---

## 1. Problem Recap (as-built)

| Endpoint | DRAFT | SUBMITTED | Notes |
|----------|:-----:|:---------:|-------|
| `payment/create-intent` | ✅ | ❌ (`status !== "DRAFT"` → 409) | card |
| `payment/confirm` | ✅ (atomic `DRAFT→PAID`) | ❌ | card |
| `payment/zelle-submit` / `check-submit` | ✅ → `SUBMITTED` | ❌ | offline |
| `admin/payment/manual` | — | ✅ → `PAID` | admin marks offline payment received |

`SUBMITTED` means the registrant chose **Zelle or Check**. Side effects already applied at submit time:
- Manual-payment discount line item added (`sort_order = 999`, `total_cents < 0`), and `invoices.total_cents` + `registrations.total_amount_cents` reduced.
- A `eckcm_payments` row exists: `payment_method ∈ {ZELLE, CHECK}`, `status = PENDING`.
- E-Pass tokens exist but **`is_active = false`**.

So switching to card is **not** "just allow SUBMITTED in create-intent" — it must reverse the discount, supersede the pending manual payment, and activate the existing inactive E-Pass tokens.

---

## 2. Decisions (confirmed with user)

1. **Mechanism:** self-service payment link, generated from `admin/registrations` detail view.
2. **Amount:** card **full price** — remove the manual-payment discount.
3. **Link auth:** dedicated **random token stored on the registration** (raw + sha256 hash, mirroring E-Pass). No login required. Revocable / re-issuable.
4. **Process:** feature branch → design doc → code → Stripe **test mode** verification → Preview Deploy → user approval → merge. No direct `main` push; user runs `supabase db push`.

---

## 3. Database Design (additive)

New nullable columns on `eckcm_registrations`:

```sql
payment_link_token         text         -- raw token (for admin re-copy/display)
payment_link_token_hash    text         -- sha256(token) — indexed lookup, not in query logs
payment_link_created_at    timestamptz
payment_link_expires_at    timestamptz  -- nullable; null = no expiry
```

Partial unique index:

```sql
create unique index eckcm_registrations_payment_link_token_hash_key
  on eckcm_registrations (payment_link_token_hash)
  where payment_link_token_hash is not null;
```

Migration file: `supabase/migrations/20260529000000_add-payment-link-token.sql` (+ `rollbacks/…add-payment-link-token.rollback.sql`).
No data backfill needed (all new columns nullable). No existing column altered/dropped.

---

## 4. API Design (all new — existing routes unchanged)

### 4.1 Admin: generate link

```
POST /api/admin/registrations/[id]/payment-link
Auth: admin role
Guard: registration.status === "SUBMITTED"
```

1. Generate 32-byte random token (`crypto.randomBytes(32).base64url`), compute sha256 hash.
2. Store `payment_link_token`, `payment_link_token_hash`, `payment_link_created_at` (+ optional `payment_link_expires_at`). Overwrites any prior token (re-issue invalidates old link).
3. Audit log: `PAYMENT_LINK_CREATED`.
4. Response: `{ url: "https://<host>/pay/<token>" }`.

> Idempotent-friendly: if a non-expired token exists, may reuse it instead of regenerating (admin convenience). Decision: **reuse if present & not expired, else generate.**

### 4.2 Public: create PaymentIntent (token-authorized)

```
POST /api/payment/link/create-intent
Body: { token, coversFees? }
Auth: token (sha256 → registration); NO session
```

1. Resolve registration by `payment_link_token_hash`; 404 if not found, 410 if expired.
2. If `status === "PAID"` → `{ alreadyPaid: true }` (page shows "이미 결제됨").
3. Guard `status === "SUBMITTED"` (else 409).
4. **Reverse manual discount → card list price** (idempotent):
   - Delete discount line item(s) (`invoice_id = X AND sort_order = 999 AND total_cents < 0`).
   - Recompute `invoices.total_cents = SUM(remaining line_items.total_cents)`; mirror to `registrations.total_amount_cents`.
5. **Supersede pending manual payment:** delete the `PENDING` `ZELLE`/`CHECK` `eckcm_payments` row for this invoice (no money moved). Cancel any orphan Stripe PIs (mirror `zelle-submit` cleanup).
6. Create Stripe card PI for `coversFees ? calcAmountWithFees(total) : total`; payment method types card-only (reuse existing config). Honor `payment_test_mode` ($1) like existing routes.
   - **Metadata:** `{ registrationId, invoiceId, confirmationCode, type: "registration", coversFees, source: "payment_link" }` (no `userId`).
7. Insert `PENDING` `eckcm_payments` row (`payment_method = "CARD"`).
8. Response: `{ clientSecret, publishableKey, amount, baseCents }`.

### 4.3 Public: confirm (token-authorized)

```
POST /api/payment/link/confirm
Body: { token, paymentIntentId }
Auth: token; NO session
```

1. Resolve registration by token hash.
2. Idempotent: if already `PAID` → ensure tokens active + email, return `already_confirmed`.
3. Verify PI with Stripe: `status === "succeeded"` **and** `metadata.registrationId === registration.id` (per [[stripe-pi-safety]] — trust Stripe, not local state).
4. **Atomic** `update ... set status='PAID' where id=X and status='SUBMITTED'`. Zero rows updated → concurrent finalize → treat as idempotent success.
5. `insertInitialPayment(...)` ledger (amount = `paymentIntent.amount`, `source: "payment_link"`).
6. `eckcm_payments → SUCCEEDED` (by `stripe_payment_intent_id`); `eckcm_invoices → SUCCEEDED, paid_at`.
7. **Activate existing E-Pass tokens:** `update eckcm_epass_tokens set is_active=true where registration_id=X and is_active=false`, **then** `generateEPassAndSendEmail` for any missing tokens + confirmation email.
   - ⚠️ Critical: the existing `confirm` route's `generateEPassAndSendEmail` only **inserts missing** tokens; it does **not** flip existing inactive ones. SUBMITTED regs already have inactive tokens, so explicit activation is required (matches `admin/payment/manual` behavior).
8. `recalculateInventorySafe` + `syncRegistration` (Google Sheets).
9. **Clear the token** (`payment_link_token*` → null) — one-time use.
10. Audit log: `PAYMENT_LINK_PAID`.

### 4.4 Webhook (safety net — see §7)

Existing `stripe/webhook` already finalizes any non-PAID reg with `metadata.registrationId` to `PAID` and sends email. The new PI carries `registrationId`, so the webhook is an automatic backstop if the client confirm never runs. **Gap:** the webhook (like `confirm`) does not activate pre-existing inactive tokens and does not call `insertInitialPayment`. See §7 for the decision.

---

## 5. Frontend

### 5.1 Public page: `src/app/pay/[token]/page.tsx`

Mirrors the `epass/[token]` public pattern (top-level, no auth) + the card half of the wizard payment page.

```
PayByLinkPage (token)
├── on load → POST /api/payment/link/create-intent → { clientSecret, ... }
│     ├── alreadyPaid → "이미 결제 완료" + dashboard link
│     ├── expired/invalid → error card
│     └── ok → render Stripe <Elements>
├── Order summary (card list price, no discount) + optional "Cover processing fees" toggle
├── <PaymentElement> + submit → stripe.confirmPayment({ return_url: /pay/<token>?status })
└── on return (status=succeeded) → POST /api/payment/link/confirm → success screen / confirmation
```

Reuse: `STRIPE_APPEARANCE`, `getStripeWithKey`, `PaymentElement`. The wizard's `StripePaymentForm` is a local component in `payment/page.tsx`; build a **slim card-only form** on the public page rather than refactoring the working wizard (smaller blast radius). `return_url` confirm handling mirrors `register/payment-complete/page.tsx` but calls `link/confirm` (token), not `confirm` (session).

### 5.2 Admin button: `registration-detail-sheet.tsx`

In the "Payment & Invoice" section, when `reg.status === "SUBMITTED"`:
- Button **"카드 결제 링크 생성"** → `POST /api/admin/registrations/{id}/payment-link` → dialog showing the URL with a **Copy** button (and room for "이메일로 보내기" later).
- Note in dialog: "카드 정가로 청구됩니다 (수동결제 할인 제외)."

---

## 6. Money Safety & Idempotency

| Risk | Mitigation |
|------|-----------|
| Double charge (link used twice) | Atomic `SUBMITTED→PAID`; idempotent confirm; token cleared on success |
| Admin marks manual-paid while link open | Atomic guard — whichever finalizes first wins; the other no-ops |
| Discount stays / wrong price | Server-side discount reversal in `link/create-intent`; amount derived from invoice line items, never the client |
| Dangling PENDING Zelle/Check payment | Superseded (deleted) before card PI creation |
| Inactive E-Pass after payment | Explicit `is_active=true` activation in `link/confirm` |
| Local state drift vs Stripe | PI verified via Stripe API before any state change ([[stripe-pi-safety]]) |
| Processing fee | `coversFees` toggle reused; fee math = existing `ceil((base+30)/0.971)` ([[feedback-processing-fee]]) |
| Guessable link | 32-byte random token (not `confirmation_code`, which is `R2026KIM0001`-predictable) |

---

## 7. Open Decision: webhook backstop

The new card PI is auto-handled by the existing webhook (`→ PAID` + email). But for a **previously-SUBMITTED** reg the webhook will **not** activate the old inactive E-Pass tokens nor write the `initial_payment` ledger row (pre-existing gaps G2/G3).

- **Option A (CHOSEN — 2026-05-29):** keep the webhook as the status/email backstop; rely on `link/confirm` for token activation + ledger. Residual risk: if the browser dies exactly between Stripe success and `link/confirm`, the reg becomes PAID with inactive E-Pass + missing ledger row until admin re-syncs. Low probability; admin can re-activate. **Do not touch the LIVE webhook this iteration.**
- **Option B (deferred):** make a small **additive** change to the webhook to also activate inactive tokens + `insertInitialPayment` for `source: "payment_link"` PIs. Closes the gap fully but touches LIVE webhook code (needs explicit OK + careful test). Fast-follow if the residual risk in A ever materializes.

---

## 8. Reuse Map

| Need | Reused from |
|------|-------------|
| Fee math | `update-method-discount.calcAmountWithFees` / `pricing.service` |
| PI verify + atomic finalize + ledger | `payment/confirm` (`insertInitialPayment`, `generateEPassAndSendEmail`) |
| Pending-PI cleanup | `payment/zelle-submit` |
| Public token page pattern | `epass/[token]` |
| Post-redirect confirm pattern | `register/payment-complete` |
| Stripe client / appearance | `lib/stripe/*`, `STRIPE_APPEARANCE` |

---

## 9. Out of Scope (this iteration)

- Bulk "email card link to all SUBMITTED" (button is per-registration; bulk = fast-follow).
- Changing the existing DRAFT card flow or the Zelle/Check flow.
- Refund path (unchanged).
- Letting card-switchers keep the discount (decided: full price).

---

## 10. Test Plan (Stripe test mode)

1. Seed a `SUBMITTED` (Zelle) registration in test mode (discount applied, inactive E-Pass).
2. Admin → generate link → open in incognito (no login).
3. Verify: order summary shows **full price** (discount line gone); pending ZELLE payment removed.
4. Pay with test card `4242…` → redirect → `link/confirm`.
5. Assert: `status = PAID`; `eckcm_payments` CARD `SUCCEEDED`; invoice `SUCCEEDED`; E-Pass `is_active = true`; `initial_payment` ledger row; Sheets synced; token cleared; confirmation email sent.
6. Re-open the (now cleared) link → "이미 결제됨" / invalid. Re-submit confirm → idempotent.
7. Edge: admin marks manual-paid first, then link → link shows already-paid, no charge.

---

## 11. Implementation Progress (resume checkpoint — 2026-05-29)

**Branch:** `feat/submitted-card-payment-link` (checked out). **Webhook decision: Option A — do NOT touch LIVE webhook.**

> **STATUS: code complete; `tsc --noEmit` exit 0. (Lint not run — Next 16 removed `next lint`; direct ESLint hits a flat-config toolchain bug. tsc is the gate.) NOT committed (awaiting user). Migration NOT pushed (user runs `supabase db push`).**

### DONE
- [x] Design doc (this file)
- [x] Migration `supabase/migrations/20260529000000_add-payment-link-token.sql` (additive: `payment_link_token`, `payment_link_token_hash`, `payment_link_created_at`, `payment_link_expires_at` + partial unique index on hash). **User has NOT run `supabase db push` yet.**
- [x] Rollback `supabase/migrations/rollbacks/20260529000000_add-payment-link-token.rollback.sql`

### TODO (in order)
1. **Schemas** → `src/lib/schemas/api.ts`: `linkCreateIntentSchema = { token: z.string().min(1), coversFees: z.boolean().optional() }`, `linkConfirmSchema = { token: z.string().min(1), paymentIntentId: z.string().min(1) }`. (`uuid` helper exists there.)
2. **Admin link API** → `src/app/api/admin/registrations/[id]/payment-link/route.ts` (POST): admin auth (copy pattern from `admin/payment/manual/route.ts`), guard `status==="SUBMITTED"`, gen `crypto.randomBytes(32).toString("base64url")` + `crypto.createHash("sha256").update(token).digest("hex")`, store token/hash/created_at (reuse if existing non-expired), audit `PAYMENT_LINK_CREATED`, return `{ url: ${origin}/pay/${token} }`.
3. **Public create-intent** → `src/app/api/payment/link/create-intent/route.ts` (POST, NO session): resolve reg by `payment_link_token_hash`; `PAID`→`{alreadyPaid:true}`; expired→410; guard SUBMITTED; **reverse discount** (delete invoice_line_items where `sort_order=999 AND total_cents<0`, recompute `invoices.total_cents`=SUM(line items), mirror to `registrations.total_amount_cents`); **delete PENDING ZELLE/CHECK payment** + cancel orphan Stripe PIs (copy zelle-submit cleanup); create card PI `coversFees?calcAmountWithFees(total):total` (fee math = `Math.ceil((base+30)/(1-0.029))`); honor `event.payment_test_mode` ($1=100); metadata `{registrationId,invoiceId,confirmationCode,type:"registration",coversFees,source:"payment_link"}` (NO userId); insert PENDING CARD payment; return `{clientSecret, publishableKey, amount, baseCents}`.
4. **Public confirm** → `src/app/api/payment/link/confirm/route.ts` (POST, NO session): resolve reg by token hash; idempotent if PAID; verify PI via Stripe (`status==="succeeded"` && `metadata.registrationId===reg.id` — [[stripe-pi-safety]]); atomic `update status='PAID' where id=X and status='SUBMITTED'`; `insertInitialPayment(admin,{registrationId,totalAmountCents:pi.amount,stripePaymentIntentId,adjustedBy:<see note>,source:"payment_link"})`; payments→SUCCEEDED, invoice→SUCCEEDED+paid_at; **activate existing tokens** `update eckcm_epass_tokens set is_active=true where registration_id=X and is_active=false` THEN call `generateEPassAndSendEmail` (extract/copy from confirm/route.ts — inserts only MISSING, is_active:true, sends email via after()); `recalculateInventorySafe`; `syncRegistration`; **clear token** (`payment_link_token*`=null); audit `PAYMENT_LINK_PAID`.
5. **Public page** → `src/app/pay/[token]/page.tsx` (top-level, mirrors `epass/[token]` no-auth) + slim card-only Stripe form: on load POST link/create-intent → render `<Elements>` w/ `getStripeWithKey(publishableKey)` + `STRIPE_APPEARANCE`; `<PaymentElement>`; `confirmPayment({return_url: ${origin}/pay/${token}})`; on return (`?payment_intent`/`redirect_status`) POST link/confirm → success screen. Order summary = full price + optional "cover fees" toggle.
6. **Admin button** → `registration-detail-sheet.tsx` Payment & Invoice section (~line 522-592), when `reg.status==="SUBMITTED"`: button "카드 결제 링크 생성" → POST admin link API → dialog showing URL + Copy button. Note "카드 정가로 청구됩니다 (수동결제 할인 제외)."
7. Stripe **test mode** verify (test plan §10) → Preview Deploy → user approval → merge (no main push).

### OPEN NOTES TO RESOLVE DURING CODING
- `insertInitialPayment` `adjustedBy` param: link flow has NO user. **Check signature** in `src/lib/services/adjustment.service.ts` — if it requires a non-null uuid, use a system/admin sentinel or make nullable. (Was reading admin/payment/manual to see how it handles actor — re-read both.)
- Re-read (not yet seen this session): rest of `create-intent/route.ts` lines 90-320 (exact PI create + metadata + customer creation), `admin/payment/manual/route.ts` (admin auth + token activation precedent), `epass/[token]/page.tsx` (no-auth public page pattern), `payment/page.tsx` StripePaymentForm (~line 712-890) + `STRIPE_APPEARANCE` + `getStripeWithKey` import.
- `registrations-types.ts` exports `VALID_STATUSES` etc. Admin sheet detail uses `reg.status`, `reg.invoice_id`, `reg.payment_method`, `reg.payment_status`.
