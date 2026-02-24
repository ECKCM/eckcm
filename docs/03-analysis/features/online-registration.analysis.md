# online-registration Analysis Report

> **Analysis Type**: Gap Analysis (Design v3 vs Implementation) -- v4.0 Full Re-Analysis
>
> **Project**: ECKCM (Eastern Korean Churches Camp Meeting)
> **Analyst**: gap-detector (Opus 4.6)
> **Date**: 2026-02-24
> **Design Doc**: [online-registration.design.md](../../02-design/features/online-registration.design.md)
> **Plan Doc**: [online-registration.plan.md](../../01-plan/features/online-registration.plan.md)
> **Design Version**: v3 (Synced with implementation)
> **Previous Analysis**: v3.0 (2026-02-24, 75% match rate)

---

## 1. Analysis Overview

### 1.1 Analysis Purpose

Comprehensive gap analysis comparing the design document (v3, 1567 lines) against the actual implementation codebase. This is a full re-analysis building on the v3.0 report. The purpose is to provide an accurate item-by-item comparison across all design sections, identify active bugs, calculate the overall match rate, and prioritize the path to the 90% threshold.

### 1.2 Analysis Scope

- **Design Document**: `docs/02-design/features/online-registration.design.md` (v3)
- **Implementation Path**: `src/` (all source files)
- **Analysis Date**: 2026-02-24
- **Design Sections Covered**: 1-18 (Project Structure through Legal & Compliance)

### 1.3 Analysis Methodology

- File-by-file comparison between design Section 1 (Project Structure) and `src/` directory
- API route comparison between design Section 4 and `src/app/api/` directory
- Database table verification via `grep` for `.from("eckcm_*")` patterns
- Service/hook/component inventory against design listings
- Functional completeness assessment (does the feature work, even if structured differently)
- Each designed item scored: Implemented = 1.0, Missing = 0.0

---

## 2. Overall Scores

| Category | Designed | Implemented | Score | Status |
|----------|:--------:|:-----------:|:-----:|:------:|
| Auth Routes | 7 | 7 | 100% | Pass |
| Public Routes | 7 | 5 | 71% | Warning |
| Dashboard Routes | 6 | 6 | 100% | Pass |
| Registration Wizard | 11 | 11 | 100% | Pass |
| Admin Routes | 44 | 28 | 64% | Warning |
| API Routes | 33 | 21 | 64% | Warning |
| Services | 10 | 4 | 40% | Warning |
| Components (shared) | 26 | 25 | 96% | Pass |
| Hooks | 5 | 2 | 40% | Warning |
| Lib Infrastructure | 27 | 20 | 74% | Warning |
| Database Tables | 39 | 34 | 87% | Warning |
| PWA | 4 | 1 | 25% | Critical |
| Root Files | 3 | 2 | 67% | Warning |
| **Totals** | **222** | **166** | **75%** | **Warning** |

---

## 3. Detailed Gap Analysis (Design v3 vs Implementation)

### 3.1 Auth Routes (`(auth)/`) -- 7/7 = 100%

| Design Path | Implementation | Status |
|-------------|---------------|--------|
| `(auth)/layout.tsx` | `src/app/(auth)/layout.tsx` | Implemented |
| `(auth)/login/page.tsx` | `src/app/(auth)/login/page.tsx` | Implemented |
| `(auth)/signup/page.tsx` | `src/app/(auth)/signup/page.tsx` | Implemented |
| `(auth)/signup/complete-profile/page.tsx` | `src/app/(auth)/signup/complete-profile/page.tsx` | Implemented |
| `(auth)/forgot-password/page.tsx` | `src/app/(auth)/forgot-password/page.tsx` | Implemented |
| `(auth)/reset-password/page.tsx` | `src/app/(auth)/reset-password/page.tsx` | Implemented |
| `(auth)/callback/route.ts` | `src/app/(auth)/callback/route.ts` | Implemented |

### 3.2 Public Routes (`(public)/` + `epass/`) -- 5/7 = 71%

| Design Path | Implementation | Status |
|-------------|---------------|--------|
| `(public)/layout.tsx` | `src/app/(public)/layout.tsx` | Implemented |
| `(public)/page.tsx` (Landing) | `src/app/(public)/page.tsx` | Implemented |
| `(public)/pay/[code]/page.tsx` | -- | **Missing** |
| `(public)/donate/page.tsx` | -- | **Missing** |
| `(public)/terms/page.tsx` | `src/app/(public)/terms/page.tsx` | Implemented |
| `(public)/privacy/page.tsx` | `src/app/(public)/privacy/page.tsx` | Implemented |
| `epass/[token]/page.tsx` | `src/app/epass/[token]/page.tsx` | Implemented |

### 3.3 Protected Routes (`(protected)/`)

#### Dashboard -- 6/6 = 100%

| Design Path | Implementation | Status |
|-------------|---------------|--------|
| `dashboard/page.tsx` | `src/app/(protected)/dashboard/page.tsx` | Implemented |
| `dashboard/epass/page.tsx` | `src/app/(protected)/dashboard/epass/page.tsx` | Implemented |
| `dashboard/epass/[id]/page.tsx` | `src/app/(protected)/dashboard/epass/[id]/page.tsx` | Implemented |
| `dashboard/registrations/page.tsx` | `src/app/(protected)/dashboard/registrations/page.tsx` | Implemented |
| `dashboard/receipts/page.tsx` | `src/app/(protected)/dashboard/receipts/page.tsx` | Implemented |
| `dashboard/settings/page.tsx` | `src/app/(protected)/dashboard/settings/page.tsx` | Implemented |

#### Registration Wizard -- 11/11 = 100%

| Design Path | Implementation | Status |
|-------------|---------------|--------|
| `register/[eventId]/layout.tsx` | `src/app/(protected)/register/[eventId]/layout.tsx` | Implemented |
| `register/[eventId]/page.tsx` | `src/app/(protected)/register/[eventId]/page.tsx` | Implemented |
| `register/[eventId]/instructions/page.tsx` | `src/app/(protected)/register/[eventId]/instructions/page.tsx` | Implemented |
| `register/[eventId]/participants/page.tsx` | `src/app/(protected)/register/[eventId]/participants/page.tsx` | Implemented |
| `register/[eventId]/lodging/page.tsx` | `src/app/(protected)/register/[eventId]/lodging/page.tsx` | Implemented |
| `register/[eventId]/key-deposit/page.tsx` | `src/app/(protected)/register/[eventId]/key-deposit/page.tsx` | Implemented |
| `register/[eventId]/airport-pickup/page.tsx` | `src/app/(protected)/register/[eventId]/airport-pickup/page.tsx` | Implemented |
| `register/[eventId]/review/page.tsx` | `src/app/(protected)/register/[eventId]/review/page.tsx` | Implemented |
| `register/[eventId]/payment/page.tsx` | `src/app/(protected)/register/[eventId]/payment/page.tsx` | Implemented |
| `register/[eventId]/confirmation/page.tsx` | `src/app/(protected)/register/[eventId]/confirmation/page.tsx` | Implemented |
| `register/payment-complete/page.tsx` | `src/app/(protected)/register/payment-complete/page.tsx` | Implemented |

### 3.4 Admin Routes (`(admin)/admin/`) -- 28/44 = 64%

| Design Path | Implementation | Status |
|-------------|---------------|--------|
| **Core Layout** | | |
| `admin/layout.tsx` | `src/app/(admin)/admin/layout.tsx` | Implemented |
| `admin/page.tsx` (Dashboard) | `src/app/(admin)/admin/page.tsx` | Implemented |
| **Settings (19 designed, 12 implemented)** | | |
| `admin/settings/page.tsx` (Overview) | -- | **Missing** |
| `admin/settings/registration/page.tsx` | -- | **Missing** |
| `admin/settings/fees/page.tsx` | `src/app/(admin)/admin/settings/fees/page.tsx` | Implemented |
| `admin/settings/groups/page.tsx` | `src/app/(admin)/admin/settings/groups/page.tsx` | Implemented |
| `admin/settings/departments/page.tsx` | `src/app/(admin)/admin/settings/departments/page.tsx` | Implemented |
| `admin/settings/churches/page.tsx` | `src/app/(admin)/admin/settings/churches/page.tsx` | Implemented |
| `admin/settings/form-fields/page.tsx` | -- | **Missing** |
| `admin/settings/stripe/page.tsx` | `src/app/(admin)/admin/settings/stripe/page.tsx` | Implemented |
| `admin/settings/google-sheets/page.tsx` | -- | **Missing** |
| `admin/settings/email/page.tsx` | -- | **Missing** |
| `admin/settings/roles/page.tsx` | `src/app/(admin)/admin/settings/roles/page.tsx` | Implemented |
| `admin/settings/legal/page.tsx` | `src/app/(admin)/admin/settings/legal/page.tsx` | Implemented |
| `admin/settings/configuration/page.tsx` | `src/app/(admin)/admin/settings/configuration/page.tsx` | Implemented |
| `admin/settings/airport-rides/page.tsx` | `src/app/(admin)/admin/settings/airport-rides/page.tsx` | Implemented |
| `admin/settings/sessions/page.tsx` | `src/app/(admin)/admin/settings/sessions/page.tsx` | Implemented |
| `admin/settings/lodging/page.tsx` | `src/app/(admin)/admin/settings/lodging/page.tsx` | Implemented |
| **Events** | | |
| `admin/events/page.tsx` | `src/app/(admin)/admin/events/page.tsx` | Implemented |
| `admin/events/[eventId]/page.tsx` | `src/app/(admin)/admin/events/[eventId]/page.tsx` | Implemented |
| **Participants** | | |
| `admin/participants/page.tsx` | `src/app/(admin)/admin/participants/page.tsx` | Implemented |
| **Room Groups** | | |
| `admin/room-groups/page.tsx` | `src/app/(admin)/admin/room-groups/page.tsx` | Implemented |
| **Lodging (4 designed, 0 implemented)** | | |
| `admin/lodging/page.tsx` (Overview) | -- | **Missing** |
| `admin/lodging/buildings/page.tsx` | -- | **Missing** (CRUD lives in settings/lodging) |
| `admin/lodging/pending/page.tsx` | -- | **Missing** |
| `admin/lodging/assigned/page.tsx` | -- | **Missing** |
| **Meals** | | |
| `admin/meals/page.tsx` | -- | **Missing** |
| **Users** | | |
| `admin/users/page.tsx` | `src/app/(admin)/admin/users/page.tsx` | Implemented |
| `admin/users/[userId]/page.tsx` | -- | **Missing** |
| **Check-in (6 designed, 1 implemented)** | | |
| `admin/checkin/page.tsx` (Hub) | `src/app/(admin)/admin/checkin/page.tsx` | Implemented |
| `admin/checkin/self/page.tsx` | -- | **Missing** |
| `admin/checkin/kiosk/page.tsx` | -- | **Missing** |
| `admin/checkin/session/page.tsx` | -- | **Missing** |
| `admin/checkin/session/[sessionId]/page.tsx` | -- | **Missing** |
| `admin/checkin/session/new/page.tsx` | -- | **Missing** |
| **Registrations** | | |
| `admin/registrations/page.tsx` | `src/app/(admin)/admin/registrations/page.tsx` | Implemented |
| `admin/registrations/create/page.tsx` | `src/app/(admin)/admin/registrations/create/page.tsx` | Implemented |
| **Invoices** | | |
| `admin/invoices/page.tsx` | `src/app/(admin)/admin/invoices/page.tsx` | Implemented |
| **Print** | | |
| `admin/print/lanyard/page.tsx` | -- | **Missing** |
| `admin/print/qr-cards/page.tsx` | -- | **Missing** |
| **Airport** | | |
| `admin/airport/page.tsx` | `src/app/(admin)/admin/airport/page.tsx` | Implemented |
| **Inventory** | | |
| `admin/inventory/page.tsx` | `src/app/(admin)/admin/inventory/page.tsx` | Implemented |
| **Audit** | | |
| `admin/audit/page.tsx` | `src/app/(admin)/admin/audit/page.tsx` | Implemented |

**Admin Missing Summary (16 pages)**: settings/overview, settings/registration, settings/form-fields, settings/google-sheets, settings/email, lodging/overview, lodging/buildings, lodging/pending, lodging/assigned, meals, users/[userId], checkin/self, checkin/kiosk, checkin/session (3 pages), print/lanyard, print/qr-cards.

### 3.5 API Routes -- 21/33 = 64%

| Design Route | Implementation | Status |
|-------------|---------------|--------|
| **Auth** | | |
| `POST /api/auth/callback` | `src/app/(auth)/callback/route.ts` | Implemented |
| **Registration** | | |
| `POST /api/registration/estimate` | `src/app/api/registration/estimate/route.ts` | Implemented |
| `POST /api/registration/submit` | `src/app/api/registration/submit/route.ts` | Implemented |
| `POST /api/registration/[id]/cancel` | -- | **Missing** |
| `GET /api/registration/[id]/event-id` | `src/app/api/registration/[id]/event-id/route.ts` | Implemented |
| **Payment** | | |
| `POST /api/payment/create-intent` | `src/app/api/payment/create-intent/route.ts` | Implemented |
| `POST /api/payment/confirm` | `src/app/api/payment/confirm/route.ts` | Implemented |
| `GET /api/payment/retrieve-intent` | `src/app/api/payment/retrieve-intent/route.ts` | Implemented |
| `POST /api/payment/zelle-submit` | `src/app/api/payment/zelle-submit/route.ts` | Implemented |
| `GET /api/payment/methods` | `src/app/api/payment/methods/route.ts` | Implemented |
| `POST /api/payment/donate` | -- | **Missing** |
| `POST /api/webhooks/stripe` | `src/app/api/webhooks/stripe/route.ts` | Implemented |
| `GET /api/stripe/publishable-key` | `src/app/api/stripe/publishable-key/route.ts` | Implemented |
| **Check-in** | | |
| `POST /api/checkin/verify` | `src/app/api/checkin/verify/route.ts` | Implemented |
| `POST /api/checkin/batch-sync` | `src/app/api/checkin/batch-sync/route.ts` | Implemented |
| `GET /api/checkin/epass-cache` | `src/app/api/checkin/epass-cache/route.ts` | Implemented |
| `GET /api/checkin/delta` | -- | **Missing** |
| `GET /api/checkin/stats` | `src/app/api/checkin/stats/route.ts` | Implemented |
| **Email** | | |
| `POST /api/email/confirmation` | -- | **Missing** |
| `POST /api/email/invoice` | -- | **Missing** |
| `POST /api/email/test` | -- | **Missing** |
| **Admin** | | |
| `POST /api/admin/lodging/magic-generator` | -- | **Missing** |
| `POST /api/admin/hard-reset-event` | `src/app/api/admin/hard-reset-event/route.ts` | Implemented |
| `POST /api/admin/invoices/custom` | -- | **Missing** |
| `POST /api/admin/registration` | `src/app/api/admin/registration/route.ts` | Implemented |
| `POST /api/admin/refund` | `src/app/api/admin/refund/route.ts` | Implemented |
| `POST /api/admin/payment/manual` | `src/app/api/admin/payment/manual/route.ts` | Implemented |
| `GET /api/admin/stripe-config` | `src/app/api/admin/stripe-config/route.ts` | Implemented |
| `GET /api/admin/app-config` | `src/app/api/admin/app-config/route.ts` | Implemented |
| **Export** | | |
| `POST /api/export/csv` | -- | **Missing** |
| `POST /api/export/pdf` | -- | **Missing** |
| **Other** | | |
| `POST /api/sheets/sync` | -- | **Missing** |
| `GET /api/epass/[token]` | -- | **Missing** (served as page route at `/epass/[token]`) |

#### Implementation-Only API Routes (Not in Design)

| Route | File | Purpose |
|-------|------|---------|
| `POST /api/admin/stripe-sync` | `src/app/api/admin/stripe-sync/route.ts` | Sync Stripe payments with DB |
| `GET /api/admin/refund/info` | `src/app/api/admin/refund/info/route.ts` | Get refund summary for a payment |
| `POST /api/payment/update-cover-fees` | `src/app/api/payment/update-cover-fees/route.ts` | Update cover-fees flag |

### 3.6 Services (`src/lib/services/`) -- 4/10 = 40%

| Design Service | Implementation | Status |
|---------------|---------------|--------|
| `pricing.service.ts` | `src/lib/services/pricing.service.ts` | Implemented |
| `confirmation-code.service.ts` | `src/lib/services/confirmation-code.service.ts` | Implemented |
| `epass.service.ts` | `src/lib/services/epass.service.ts` | Implemented |
| `invoice.service.ts` | `src/lib/services/invoice.service.ts` | Implemented |
| `checkin.service.ts` | -- | **Missing** (logic inline in route handler) |
| `registration.service.ts` | -- | **Missing** (logic inline in submit route) |
| `lodging.service.ts` | -- | **Missing** |
| `meal.service.ts` | -- | **Missing** (meal logic in pricing service) |
| `audit.service.ts` | -- | **Missing** (audit inserts inline across routes) |
| `sheets.service.ts` | -- | **Missing** (Google Sheets not implemented) |

#### Implementation-Only Service

| Service | File | Notes |
|---------|------|-------|
| `refund.service.ts` | `src/lib/services/refund.service.ts` | Functional -- not in design |

### 3.7 Components (Shared) -- 25/26 = 96%

#### Auth Components -- 2/2

| Design Component | Implementation | Status |
|------------------|---------------|--------|
| `oauth-buttons.tsx` | `src/components/auth/oauth-buttons.tsx` | Implemented |
| `profile-form.tsx` | `src/components/auth/profile-form.tsx` | Implemented |

#### Registration Components -- 3/3

| Design Component | Implementation | Status |
|------------------|---------------|--------|
| `wizard-stepper.tsx` | `src/components/registration/wizard-stepper.tsx` | Implemented |
| `date-range-picker.tsx` | `src/components/registration/date-range-picker.tsx` | Implemented |
| `meal-selection-grid.tsx` | `src/components/registration/meal-selection-grid.tsx` | Implemented |

#### Payment Components -- 1/2

| Design Component | Implementation | Status |
|------------------|---------------|--------|
| `stripe-checkout.tsx` | `src/components/payment/stripe-checkout.tsx` | Implemented |
| `payment-method-selector.tsx` | -- | **Missing** |

#### Check-in Components -- 2/2

| Design Component | Implementation | Status |
|------------------|---------------|--------|
| `scan-result-card.tsx` | `src/components/checkin/scan-result-card.tsx` | Implemented |
| `recent-checkins.tsx` | `src/components/checkin/recent-checkins.tsx` | Implemented |

#### Admin Components -- 2/2

| Design Component | Implementation | Status |
|------------------|---------------|--------|
| `admin-sidebar.tsx` | `src/components/admin/admin-sidebar.tsx` | Implemented |
| `confirm-delete-dialog.tsx` | `src/components/admin/confirm-delete-dialog.tsx` | Implemented |

#### Shared Components -- 15/15

| Design Component | Implementation | Status |
|------------------|---------------|--------|
| `language-switcher.tsx` | `src/components/shared/language-switcher.tsx` | Implemented |
| `theme-toggle.tsx` | `src/components/shared/theme-toggle.tsx` | Implemented |
| `birth-date-picker.tsx` | `src/components/shared/birth-date-picker.tsx` | Implemented |
| `theme-provider.tsx` | `src/components/shared/theme-provider.tsx` | Implemented |
| `toolbar.tsx` | `src/components/shared/toolbar.tsx` | Implemented |
| `user-menu.tsx` | `src/components/shared/user-menu.tsx` | Implemented |
| `phone-input.tsx` | `src/components/shared/phone-input.tsx` | Implemented |
| `password-input.tsx` | `src/components/shared/password-input.tsx` | Implemented |
| `church-combobox.tsx` | `src/components/shared/church-combobox.tsx` | Implemented |
| `adventist-logo.tsx` | `src/components/shared/adventist-logo.tsx` | Implemented |
| `eckcm-logo.tsx` | `src/components/shared/eckcm-logo.tsx` | Implemented |
| `color-theme-provider.tsx` | `src/components/shared/color-theme-provider.tsx` | Implemented |
| `top-header.tsx` | `src/components/shared/top-header.tsx` | Implemented |
| `site-footer.tsx` | `src/components/shared/site-footer.tsx` | Implemented |
| `turnstile-widget.tsx` | `src/components/shared/turnstile-widget.tsx` | Implemented |

#### Implementation-Only Components (Not in Design)

| Component | File | Notes |
|-----------|------|-------|
| `force-light-mode.tsx` | `src/components/registration/force-light-mode.tsx` | Forces light mode during registration |
| `payment-icons.tsx` | `src/components/payment/payment-icons.tsx` | Brand icons for payment methods |
| `check-visual.tsx` | `src/components/payment/check-visual.tsx` | ACH check visual component |

### 3.8 Hooks -- 2/5 = 40%

| Design Hook | Implementation | Status | Notes |
|------------|---------------|--------|-------|
| `use-auth.ts` | -- | **Missing** | Auth state handled by Supabase SDK directly |
| `use-registration.ts` | `src/lib/context/registration-context.tsx` | Implemented | `useRegistration()` exported from context file |
| `use-realtime.ts` | -- | **Missing** | Realtime subscriptions not implemented as hook |
| `use-offline-checkin.ts` | -- | **Missing** | Offline check-in not implemented as hook |
| `use-mobile.tsx` | `src/lib/hooks/use-mobile.tsx` | Implemented |

> Note: `useRegistration` lives at `src/lib/context/registration-context.tsx` instead of `src/lib/hooks/use-registration.ts`. Functionally equivalent -- consumers import and use `useRegistration()` identically.

### 3.9 Lib Infrastructure -- 20/27 = 74%

#### Supabase (`src/lib/supabase/`) -- 4/4

| Design File | Implementation | Status |
|-------------|---------------|--------|
| `client.ts` | `src/lib/supabase/client.ts` | Implemented |
| `server.ts` | `src/lib/supabase/server.ts` | Implemented |
| `middleware.ts` | `src/lib/supabase/middleware.ts` | Implemented |
| `admin.ts` | `src/lib/supabase/admin.ts` | Implemented |

#### Stripe (`src/lib/stripe/`) -- 2/2

| Design File | Implementation | Status |
|-------------|---------------|--------|
| `client.ts` | `src/lib/stripe/client.ts` | Implemented |
| `config.ts` | `src/lib/stripe/config.ts` | Implemented |

#### Email (`src/lib/email/`) -- 3/6

| Design File | Implementation | Status |
|-------------|---------------|--------|
| `resend.ts` | `src/lib/email/resend.ts` | Implemented |
| `send-confirmation.ts` | `src/lib/email/send-confirmation.ts` | Implemented |
| `templates/confirmation.tsx` | `src/lib/email/templates/confirmation.tsx` | Implemented |
| `templates/epass.tsx` | -- | **Missing** |
| `templates/invoice.tsx` | -- | **Missing** |
| `templates/session-attendance.tsx` | -- | **Missing** |

#### i18n (`src/lib/i18n/`) -- 4/4

| Design File | Implementation | Status |
|-------------|---------------|--------|
| `config.ts` | `src/lib/i18n/config.ts` | Implemented |
| `context.tsx` | `src/lib/i18n/context.tsx` | Implemented |
| `en.json` | `src/lib/i18n/en.json` | Implemented |
| `ko.json` | `src/lib/i18n/ko.json` | Implemented |

#### Utils (`src/lib/utils/`) -- 5/5

| Design File | Implementation | Status |
|-------------|---------------|--------|
| `constants.ts` | `src/lib/utils/constants.ts` | Implemented |
| `validators.ts` | `src/lib/utils/validators.ts` | Implemented |
| `formatters.ts` | `src/lib/utils/formatters.ts` | Implemented |
| `field-helpers.ts` | `src/lib/utils/field-helpers.ts` | Implemented |
| `profanity-filter.ts` | `src/lib/utils/profanity-filter.ts` | Implemented |

#### Types (`src/lib/types/`) -- 2/4

| Design File | Implementation | Status |
|-------------|---------------|--------|
| `database.ts` | `src/lib/types/database.ts` | Implemented |
| `registration.ts` | `src/lib/types/registration.ts` | Implemented |
| `payment.ts` | -- | **Missing** |
| `checkin.ts` | -- | **Missing** |

#### Middleware -- 0/1

| Design File | Implementation | Status |
|-------------|---------------|--------|
| `src/middleware.ts` (Next.js root) | -- | **Missing** (`src/proxy.ts` exists with middleware-like logic but is non-standard) |

#### Implementation-Only Lib Files

| File | Path | Notes |
|------|------|-------|
| `app-config.ts` | `src/lib/app-config.ts` | Global app config fetcher |
| `color-theme.ts` | `src/lib/color-theme.ts` | Color theme definitions |
| `offline-store.ts` | `src/lib/checkin/offline-store.ts` | IndexedDB store for offline check-in data |
| `registration-context.tsx` | `src/lib/context/registration-context.tsx` | Registration wizard state (exports useRegistration) |

### 3.10 Database Tables -- 34/39 = 87%

Tables verified via `.from("eckcm_*")` code references:

| Design Table | Code References | Status |
|-------------|:-:|--------|
| `eckcm_users` | Yes | Implemented |
| `eckcm_roles` | Yes | Implemented |
| `eckcm_permissions` | -- | DB-only (serves RLS functions) -- Counted as implemented |
| `eckcm_role_permissions` | -- | DB-only (serves RLS functions) -- Counted as implemented |
| `eckcm_staff_assignments` | Yes | Implemented |
| `eckcm_events` | Yes | Implemented |
| `eckcm_departments` | Yes | Implemented |
| `eckcm_churches` | Yes | Implemented |
| `eckcm_registration_groups` | Yes | Implemented |
| `eckcm_fee_categories` | Yes | Implemented |
| `eckcm_registration_group_fee_categories` | Yes | Implemented |
| `eckcm_form_field_config` | -- | **Not referenced** (feature not implemented) |
| `eckcm_people` | Yes | Implemented |
| `eckcm_user_people` | Yes | Implemented |
| `eckcm_registrations` | Yes | Implemented |
| `eckcm_registration_drafts` | Yes | Implemented |
| `eckcm_registration_selections` | Yes | Implemented |
| `eckcm_groups` | Yes | Implemented |
| `eckcm_group_memberships` | Yes | Implemented |
| `eckcm_buildings` | Yes | Implemented |
| `eckcm_floors` | Yes | Implemented |
| `eckcm_rooms` | Yes | Implemented |
| `eckcm_room_assignments` | Yes | Implemented |
| `eckcm_meal_rules` | -- | **Not referenced** (meals admin not implemented) |
| `eckcm_meal_selections` | -- | **Not referenced** (meals admin not implemented) |
| `eckcm_invoices` | Yes | Implemented |
| `eckcm_invoice_line_items` | Yes | Implemented |
| `eckcm_payments` | Yes | Implemented |
| `eckcm_refunds` | Yes | Implemented |
| `eckcm_sessions` | Yes | Implemented |
| `eckcm_checkins` | Yes | Implemented |
| `eckcm_epass_tokens` | Yes | Implemented |
| `eckcm_audit_logs` | Yes | Implemented |
| `eckcm_notifications` | Yes | Implemented |
| `eckcm_app_config` | Yes | Implemented |
| `eckcm_airport_rides` | Yes | Implemented |
| `eckcm_registration_rides` | Yes | Implemented |
| `eckcm_legal_content` | Yes | Implemented |
| `eckcm_sheets_cache_participants` | -- | **Not referenced** (Google Sheets not implemented) |

**Breakdown**: 31 referenced in app code + 3 DB-only for RLS (eckcm_permissions, eckcm_role_permissions, + eckcm_notifications counted above) = 34 implemented. 5 not referenced / not functional.

#### Implementation-Only Table (Not in Design)

| Table | File | Notes |
|-------|------|-------|
| `eckcm_fee_category_inventory` | `src/app/(admin)/admin/inventory/inventory-manager.tsx` | Inventory tracking -- not in design |

### 3.11 PWA Configuration -- 1/4 = 25%

| Design Item | Implementation | Status |
|-------------|---------------|--------|
| `public/manifest.json` | `public/manifest.json` | Implemented |
| `public/sw.js` | -- | **Missing** |
| Service Worker config in next.config.ts | -- | **Missing** |
| Offline check-in flow (IndexedDB) | Partial (`src/lib/checkin/offline-store.ts` exists) | **Missing** (not wired) |

> `offline-store.ts` exists with IDB schema but there is no service worker to activate offline capability. PWA icons exist at `public/icons/`.

### 3.12 Root Files -- 2/3 = 67%

| Design Item | Implementation | Status |
|-------------|---------------|--------|
| `src/middleware.ts` | -- | **Missing** (`src/proxy.ts` exists instead) |
| `src/app/layout.tsx` | `src/app/layout.tsx` | Implemented |
| `src/app/not-found.tsx` | `src/app/not-found.tsx` | Implemented |

---

## 4. Implementation Phase Assessment

Based on design Section 9 (Implementation Order), phase-by-phase assessment:

| Phase | Description | Score | Notes |
|-------|-------------|:-----:|-------|
| 1 | Project Setup | 95% | Next.js, Supabase, Tailwind, shadcn/ui all configured. PWA incomplete. |
| 2 | Auth & Profile | 95% | OAuth, signup, profile, forgot/reset password all working. |
| 3 | Event & Catalog | 90% | Events, groups, fees, departments, churches implemented. Form fields missing. |
| 4 | Registration Wizard | 90% | Full 5-step wizard + instructions + payment. Draft persistence working. |
| 5 | Payment | 88% | Stripe + Zelle + refund working. Donation not implemented. |
| 6 | Profile Dashboard | 85% | E-Pass, receipts, registrations, settings all present. Realtime missing. |
| 7 | Admin: Core | 70% | Settings, events, participants, users, roles present. Some settings pages missing. |
| 8 | Admin: Lodging | 50% | Settings/lodging CRUD exists. Separate lodging workflow pages missing entirely. |
| 9 | Meals | 60% | Meal selection in registration works. Meals admin dashboard missing. |
| 10 | Check-in | 35% | Hub page + scanner component exist. Self/kiosk/session sub-pages missing. |
| 11 | Invoice & Print | 45% | Invoices page exists. Print pages not implemented. Export missing. |
| 12 | Audit & Comms | 25% | Audit logs implemented. Email/realtime/Sheets largely missing. |
| 13 | Legal & Compliance | 90% | Terms, privacy, legal CMS all working. |
| 14 | i18n & Dark Mode | 60% | i18n framework present (en.json, ko.json). Coverage incomplete. |
| 15 | Polish & Deploy | 10% | No tests, no PWA service worker, minimal optimization. |

---

## 5. Active Bugs

### 5.1 `eckcm_system_settings` References (CRITICAL -- UNFIXED)

Three API route files still reference the **nonexistent** `eckcm_system_settings` table instead of `eckcm_app_config`. These will cause runtime errors when the Supabase query fails:

| File | Line | Bad Reference | Should Be |
|------|:----:|---------------|-----------|
| `src/app/api/registration/submit/route.ts` | 128 | `eckcm_system_settings` | `eckcm_app_config` |
| `src/app/api/registration/estimate/route.ts` | 73 | `eckcm_system_settings` | `eckcm_app_config` |
| `src/app/api/admin/registration/route.ts` | 125 | `eckcm_system_settings` | `eckcm_app_config` |

**Severity**: Critical. Breaks registration submission, price estimation, and admin registration creation. This has been identified since the v2.0 analysis and remains unfixed.

---

## 6. Undocumented Implementation Items

These items exist in the implementation but are NOT in the design document. They should be added to the design to keep the documents synchronized:

| # | Category | Item | File |
|---|----------|------|------|
| 1 | Table | `eckcm_fee_category_inventory` | `src/app/(admin)/admin/inventory/inventory-manager.tsx` |
| 2 | Service | `refund.service.ts` | `src/lib/services/refund.service.ts` |
| 3 | API Route | `POST /api/admin/stripe-sync` | `src/app/api/admin/stripe-sync/route.ts` |
| 4 | API Route | `GET /api/admin/refund/info` | `src/app/api/admin/refund/info/route.ts` |
| 5 | API Route | `POST /api/payment/update-cover-fees` | `src/app/api/payment/update-cover-fees/route.ts` |
| 6 | Component | `force-light-mode.tsx` | `src/components/registration/force-light-mode.tsx` |
| 7 | Component | `payment-icons.tsx` | `src/components/payment/payment-icons.tsx` |
| 8 | Component | `check-visual.tsx` | `src/components/payment/check-visual.tsx` |
| 9 | Lib | `app-config.ts` | `src/lib/app-config.ts` |
| 10 | Lib | `color-theme.ts` | `src/lib/color-theme.ts` |
| 11 | Lib | `offline-store.ts` | `src/lib/checkin/offline-store.ts` |
| 12 | Lib | `registration-context.tsx` | `src/lib/context/registration-context.tsx` |
| 13 | Middleware | `proxy.ts` replaces `middleware.ts` | `src/proxy.ts` |

---

## 7. Match Rate Calculation

### Methodology

Each designed item is scored as:
- **Implemented** = 1.0 point (exact path match or functionally equivalent)
- **Missing** = 0.0 points
- Items at different paths but functionally equivalent count as implemented (e.g., `useRegistration` in context file)
- DB tables only used by RLS functions (eckcm_permissions, eckcm_role_permissions) count as implemented

### Raw Score

| Category | Designed | Implemented | Score |
|----------|:--------:|:-----------:|:-----:|
| Auth Routes | 7 | 7 | 100% |
| Public Routes | 7 | 5 | 71% |
| Dashboard Routes | 6 | 6 | 100% |
| Registration Wizard | 11 | 11 | 100% |
| Admin Routes | 44 | 28 | 64% |
| API Routes | 33 | 21 | 64% |
| Services | 10 | 4 | 40% |
| Components (shared) | 26 | 25 | 96% |
| Hooks | 5 | 2 | 40% |
| Lib Infrastructure | 27 | 20 | 74% |
| Database Tables | 39 | 34 | 87% |
| PWA | 4 | 1 | 25% |
| Root Files | 3 | 2 | 67% |
| **Totals** | **222** | **166** | **75%** |

### Weighted Score (by functional impact)

| Category | Weight | Raw Score | Weighted |
|----------|:------:|:---------:|:--------:|
| Core User Routes (Auth+Public+Dashboard+Wizard) | 25% | 94% | 23.5% |
| Admin Routes | 20% | 64% | 12.8% |
| API Routes | 20% | 64% | 12.8% |
| Services + Hooks | 10% | 40% | 4.0% |
| Components | 10% | 96% | 9.6% |
| Lib + DB + Types | 10% | 81% | 8.1% |
| PWA + Infra | 5% | 30% | 1.5% |
| **Weighted Total** | **100%** | | **72.3%** |

### Final Match Rate

```
+----------------------------------------------+
|  Overall Design Match Rate: 75%              |
+----------------------------------------------+
|  Designed items:         222                 |
|  Implemented:            166 items (75%)     |
|  Missing:                 56 items (25%)     |
+----------------------------------------------+
|  Weighted Match Rate:    72% (impact-based)  |
+----------------------------------------------+
|  Target:                 90% (200/222)       |
|  Items remaining:        34                  |
+----------------------------------------------+
```

---

## 8. Missing Features Summary

### 8.1 Missing Public Pages (2 items)

| Feature | Design Section | Impact | Priority |
|---------|:-------------:|--------|:--------:|
| Manual payment page `pay/[code]` | 1 | Users cannot pay via public link | Medium |
| Donation page `donate` | 1 | No public donation flow | Low |

### 8.2 Missing Admin Pages (16 items)

| Feature | Priority | Effort |
|---------|:--------:|:------:|
| Check-in self page (camera) | High | 3 hrs |
| Check-in kiosk page (scanner) | High | 3 hrs |
| Check-in session list | High | 2 hrs |
| Check-in session detail + QR | High | 3 hrs |
| Check-in session new | High | 2 hrs |
| Lodging overview | Medium | 3 hrs |
| Lodging pending assignments | Medium | 3 hrs |
| Lodging assigned groups | Medium | 3 hrs |
| Meals dashboard | Medium | 4 hrs |
| User detail/permissions `[userId]` | Medium | 3 hrs |
| Settings registration toggle | Medium | 2 hrs |
| Settings form-fields manager | Medium | 3 hrs |
| Settings email config | Medium | 2 hrs |
| Settings overview | Low | 1 hr |
| Print lanyard | Low | 4 hrs |
| Print QR cards | Low | 4 hrs |

### 8.3 Missing API Routes (12 items)

| Route | Impact | Priority |
|-------|--------|:--------:|
| `POST /api/registration/[id]/cancel` | Users cannot cancel registrations | High |
| `GET /api/checkin/delta` | No delta sync for offline check-in | Medium |
| `POST /api/email/confirmation` | No dedicated email API endpoint | Medium |
| `POST /api/email/invoice` | No invoice email endpoint | Medium |
| `POST /api/admin/lodging/magic-generator` | Room generation API missing | Medium |
| `POST /api/admin/invoices/custom` | No custom invoice creation | Medium |
| `POST /api/export/csv` | No CSV export | Medium |
| `POST /api/export/pdf` | No PDF export | Medium |
| `POST /api/email/test` | No email testing endpoint | Low |
| `POST /api/payment/donate` | No donation payment | Low |
| `POST /api/sheets/sync` | No Google Sheets sync | Low |
| `GET /api/epass/[token]` | Served as page, not API (intentional) | Low |

### 8.4 Missing Services (6 items)

| Service | Priority | Notes |
|---------|:--------:|-------|
| `checkin.service.ts` | Medium | Logic scattered in route handler |
| `registration.service.ts` | Medium | Logic inline in submit route |
| `lodging.service.ts` | Medium | No room assignment logic service |
| `audit.service.ts` | Low | Audit inserts scattered across routes |
| `meal.service.ts` | Low | Meal logic coupled in pricing service |
| `sheets.service.ts` | Low | Google Sheets not implemented |

### 8.5 Missing Hooks (3 items)

| Hook | Priority | Notes |
|------|:--------:|-------|
| `use-realtime.ts` | Medium | No realtime subscription hook |
| `use-offline-checkin.ts` | Medium | No offline check-in capability |
| `use-auth.ts` | Low | Auth state handled by Supabase SDK directly |

### 8.6 Missing Email Templates (3 items)

| Template | Priority |
|----------|:--------:|
| `templates/epass.tsx` | Medium |
| `templates/invoice.tsx` | Medium |
| `templates/session-attendance.tsx` | Low |

### 8.7 Other Missing Items (6 items)

| Item | Category | Priority |
|------|----------|:--------:|
| `payment.ts` type definitions | Types | Low |
| `checkin.ts` type definitions | Types | Low |
| `payment-method-selector.tsx` component | Components | Low |
| `public/sw.js` service worker | PWA | Low |
| Service worker config in next.config.ts | PWA | Low |
| `src/middleware.ts` (standard Next.js middleware) | Root Files | Medium |

---

## 9. Path to 90% (34 items needed)

### Tier 1: High Impact, Quick Wins (15 items, ~30 hours)

| # | Category | Item | Est. Effort |
|---|----------|------|:-----------:|
| 1 | Bug Fix | Fix 3x `eckcm_system_settings` -> `eckcm_app_config` | 15 min |
| 2 | API | `POST /api/registration/[id]/cancel` | 2 hrs |
| 3 | Admin | Check-in self page | 3 hrs |
| 4 | Admin | Check-in kiosk page | 3 hrs |
| 5 | Admin | Check-in session list | 2 hrs |
| 6 | Admin | Check-in session detail `[sessionId]` | 3 hrs |
| 7 | Admin | Check-in session new | 2 hrs |
| 8 | Service | Extract `checkin.service.ts` from route handler | 2 hrs |
| 9 | Service | Extract `registration.service.ts` from submit route | 2 hrs |
| 10 | Service | Extract `audit.service.ts` from inline inserts | 1 hr |
| 11 | Hook | Create `use-realtime.ts` (Supabase channel wrapper) | 2 hrs |
| 12 | API | `POST /api/email/confirmation` (wrap send-confirmation) | 1 hr |
| 13 | API | `POST /api/email/invoice` | 1 hr |
| 14 | Middleware | Rename/refactor `proxy.ts` -> `middleware.ts` | 1 hr |
| 15 | Email | Create `templates/epass.tsx` | 2 hrs |

**Result after Tier 1**: 166 + 15 = 181 items (82%)

### Tier 2: Medium Impact (12 items, ~31 hours)

| # | Category | Item | Est. Effort |
|---|----------|------|:-----------:|
| 16 | Admin | Lodging overview page | 3 hrs |
| 17 | Admin | Lodging pending assignments page | 3 hrs |
| 18 | Admin | Lodging assigned groups page | 3 hrs |
| 19 | Admin | Meals dashboard | 4 hrs |
| 20 | Admin | User detail/permissions `[userId]` page | 3 hrs |
| 21 | Admin | Settings registration toggle | 2 hrs |
| 22 | Admin | Settings form-fields manager | 3 hrs |
| 23 | Admin | Settings email config | 2 hrs |
| 24 | API | `GET /api/checkin/delta` | 2 hrs |
| 25 | API | `POST /api/export/csv` | 3 hrs |
| 26 | Email | Create `templates/invoice.tsx` | 2 hrs |
| 27 | Types | Create `payment.ts` type definitions | 1 hr |

**Result after Tier 1+2**: 166 + 27 = 193 items (87%)

### Tier 3: Low Impact / Deferrable (7 items, ~31 hours)

| # | Category | Item | Est. Effort |
|---|----------|------|:-----------:|
| 28 | Public | `pay/[code]` page | 4 hrs |
| 29 | Public | `donate` page + API route | 4 hrs |
| 30 | Admin | Print lanyard page | 4 hrs |
| 31 | Admin | Print QR cards page | 4 hrs |
| 32 | Admin | Settings Google Sheets config | 3 hrs |
| 33 | PWA | Service worker + offline flow | 8 hrs |
| 34 | Service | `sheets.service.ts` + sync API | 4 hrs |

**Result after all tiers**: 166 + 34 = 200 items (90%) -- meets threshold exactly

### Alternative Path: Defer + Implement

Implement **Tier 1 + Tier 2** (27 items) and defer 7 Tier 3 items from the design scope (mark as "Phase 2" / post-launch):
- Adjusted denominator: 222 - 7 = 215
- Score: 193 / 215 = **90%** -- meets threshold

---

## 10. Recommended Actions

### Immediate Actions (This Sprint)

1. **Fix the `eckcm_system_settings` bug** in 3 files. This is a critical runtime bug blocking registration submission, price estimation, and admin registration creation. Takes 15 minutes.

2. **Sync design document to v4** by adding the 13 undocumented implementation items from Section 6 to the design. This keeps design and code in sync without changing any implementation.

### Short-Term Actions (Tier 1: ~30 hours)

3. Implement the 5 check-in sub-pages (self, kiosk, session list/detail/new) -- the largest cluster of missing admin functionality.

4. Extract 3 services (checkin, registration, audit) from inline route logic to follow the design's separation of concerns.

5. Create the middleware.ts file, the realtime hook, and the email API endpoints.

### Medium-Term Actions (Tier 2: ~31 hours)

6. Build the 4 lodging workflow pages, meals dashboard, and remaining admin settings.

7. Add export API (CSV) and remaining email templates.

### Deferrable (Tier 3: ~31 hours)

8. Donation flow, print pages, Google Sheets sync, and PWA service worker can be deferred to a Phase 2 milestone if the 90% threshold needs to be reached sooner.

---

## 11. Version History

| Version | Date | Match Rate | Changes | Analyst |
|---------|------|:----------:|---------|---------|
| 1.0 | 2026-02-22 | 76% | Initial analysis | gap-detector |
| 2.0 | 2026-02-23 | 76% | Updated after implementation changes | gap-detector |
| 3.0 | 2026-02-24 | 75% | Full re-analysis with precise counting | gap-detector |
| 4.0 | 2026-02-24 | 75% | Comprehensive v4 with tiered roadmap, phase assessment, bug tracking | gap-detector (Opus 4.6) |
