# Design: ECKCM Online Registration & Management System

> Feature: `online-registration`
> Created: 2026-02-11
> Plan Reference: [online-registration.plan.md](../../01-plan/features/online-registration.plan.md)
> Status: Draft (v4 - Synced with implementation, Act-5)
> Level: Dynamic (Next.js + Supabase + Stripe)

---

## 1. Project Structure

> **Note on component organization**: This project follows Next.js App Router **co-location pattern** where complex page-specific components are placed alongside their page files (e.g., `admin/participants/participants-table.tsx`) rather than in a separate `components/` directory. Only truly shared/reusable components go in `src/components/`. The `src/components/` tree below lists globally shared components only.

```
eckcm/
├── public/
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   ├── signup/complete-profile/page.tsx
│   │   │   ├── forgot-password/page.tsx          # Password reset request
│   │   │   ├── reset-password/page.tsx           # Password reset form
│   │   │   └── callback/route.ts
│   │   ├── (public)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                          # Landing
│   │   │   ├── pay/[code]/page.tsx               # Manual Payment (public)
│   │   │   ├── donate/page.tsx                   # Donation (public)
│   │   │   ├── terms/page.tsx                    # Terms of service
│   │   │   └── privacy/page.tsx                  # Privacy policy
│   │   ├── epass/
│   │   │   └── [token]/page.tsx                  # E-Pass Viewer (public, at root level)
│   │   ├── (protected)/
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx                      # Profile Dashboard
│   │   │   │   ├── epass/page.tsx                # E-Pass list
│   │   │   │   ├── epass/[id]/page.tsx           # E-Pass detail (mobile)
│   │   │   │   ├── registrations/page.tsx        # Registration history
│   │   │   │   ├── receipts/page.tsx             # Receipt history
│   │   │   │   └── settings/page.tsx             # Profile settings
│   │   │   └── register/
│   │   │       ├── [eventId]/
│   │   │       │   ├── layout.tsx                # Registration wizard layout
│   │   │       │   ├── page.tsx                  # Step 1: Start Registration
│   │   │       │   ├── instructions/page.tsx     # Pre-registration instructions
│   │   │       │   ├── participants/page.tsx     # Step 2: Participants Info
│   │   │       │   ├── lodging/page.tsx          # Step 3: Lodging Preferences
│   │   │       │   ├── key-deposit/page.tsx      # Step 4: Key Deposit
│   │   │       │   ├── airport-pickup/page.tsx   # Step 5: Airport Pickup
│   │   │       │   ├── review/page.tsx           # Review & Summary
│   │   │       │   ├── payment/page.tsx          # Stripe Payment
│   │   │       │   └── confirmation/page.tsx     # Success Page
│   │   │       └── payment-complete/page.tsx     # Post-payment landing
│   │   ├── (admin)/
│   │   │   └── admin/
│   │   │       ├── layout.tsx                    # Admin layout + sidebar
│   │   │       ├── page.tsx                      # Admin dashboard
│   │   │       ├── settings/
│   │   │       │   ├── page.tsx                  # System settings overview
│   │   │       │   ├── registration/page.tsx     # Registration status
│   │   │       │   ├── fees/page.tsx             # Fee categories
│   │   │       │   ├── groups/page.tsx           # Registration groups
│   │   │       │   ├── departments/page.tsx      # Departments
│   │   │       │   ├── churches/page.tsx         # Church list
│   │   │       │   ├── form-fields/page.tsx      # Form field manager
│   │   │       │   ├── stripe/page.tsx           # Stripe config
│   │   │       │   ├── google-sheets/page.tsx    # Google Sheets config
│   │   │       │   ├── email/page.tsx            # Email config & test
│   │   │       │   ├── roles/page.tsx            # Role management
│   │   │       │   ├── legal/page.tsx            # Legal content management
│   │   │       │   ├── configuration/page.tsx    # System configuration
│   │   │       │   ├── airport-rides/page.tsx    # Airport ride options
│   │   │       │   ├── sessions/page.tsx         # Session management
│   │   │       │   └── lodging/page.tsx          # Lodging settings (buildings/floors/rooms)
│   │   │       ├── events/
│   │   │       │   ├── page.tsx                  # Event list
│   │   │       │   └── [eventId]/page.tsx        # Event detail/edit
│   │   │       ├── participants/
│   │   │       │   └── page.tsx                  # Participants data table
│   │   │       ├── room-groups/
│   │   │       │   └── page.tsx                  # Room groups list
│   │   │       ├── lodging/
│   │   │       │   ├── page.tsx                  # Lodging overview
│   │   │       │   ├── buildings/page.tsx        # Building/Floor/Room CRUD
│   │   │       │   ├── pending/page.tsx          # Pending assignments
│   │   │       │   └── assigned/page.tsx         # Assigned groups
│   │   │       ├── meals/
│   │   │       │   └── page.tsx                  # Meal dashboard
│   │   │       ├── users/
│   │   │       │   ├── page.tsx                  # User list
│   │   │       │   └── [userId]/page.tsx         # User detail/permissions
│   │   │       ├── checkin/
│   │   │       │   ├── page.tsx                  # Check-in hub
│   │   │       │   ├── self/page.tsx             # Self check-in (camera)
│   │   │       │   ├── kiosk/page.tsx            # Kiosk check-in (scanner)
│   │   │       │   └── session/
│   │   │       │       ├── page.tsx              # Session list
│   │   │       │       ├── [sessionId]/page.tsx  # Session dashboard + QR
│   │   │       │       └── new/page.tsx          # Create session
│   │   │       ├── registrations/
│   │   │       │   ├── page.tsx                  # Registrations management
│   │   │       │   └── create/page.tsx           # Admin registration creation
│   │   │       ├── invoices/
│   │   │       │   └── page.tsx                  # Invoice search & management
│   │   │       ├── print/
│   │   │       │   ├── lanyard/page.tsx          # Lanyard print
│   │   │       │   └── qr-cards/page.tsx         # QR card print
│   │   │       ├── airport/
│   │   │       │   └── page.tsx                  # Airport checklist
│   │   │       ├── inventory/
│   │   │       │   └── page.tsx                  # Global inventory
│   │   │       └── audit/
│   │   │           └── page.tsx                  # Audit logs
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── callback/route.ts             # OAuth callback
│   │   │   ├── webhooks/
│   │   │   │   └── stripe/route.ts               # Stripe webhook
│   │   │   ├── stripe/
│   │   │   │   └── publishable-key/route.ts      # GET publishable key
│   │   │   ├── registration/
│   │   │   │   ├── estimate/route.ts             # POST price estimate
│   │   │   │   ├── submit/route.ts               # POST submit registration
│   │   │   │   ├── [id]/cancel/route.ts          # POST cancel registration
│   │   │   │   └── [id]/event-id/route.ts        # GET event ID by registration
│   │   │   ├── payment/
│   │   │   │   ├── create-intent/route.ts        # POST Create PaymentIntent
│   │   │   │   ├── confirm/route.ts              # POST Confirm payment
│   │   │   │   ├── retrieve-intent/route.ts      # GET Retrieve PaymentIntent
│   │   │   │   ├── zelle-submit/route.ts         # POST Zelle payment submission
│   │   │   │   └── methods/route.ts              # GET Available payment methods
│   │   │   ├── checkin/
│   │   │   │   ├── verify/route.ts               # POST QR verification
│   │   │   │   ├── batch-sync/route.ts           # POST Batch upload (offline)
│   │   │   │   ├── epass-cache/route.ts          # GET Full participant allowlist cache
│   │   │   │   ├── delta/route.ts                # GET Changes since timestamp
│   │   │   │   └── stats/route.ts                # GET Check-in statistics
│   │   │   ├── epass/
│   │   │   │   └── [token]/route.ts              # E-Pass public endpoint
│   │   │   ├── email/
│   │   │   │   ├── confirmation/route.ts         # POST Send confirmation
│   │   │   │   ├── invoice/route.ts              # POST Send invoice
│   │   │   │   └── test/route.ts                 # POST Test email
│   │   │   ├── export/
│   │   │   │   ├── csv/route.ts                  # POST CSV export
│   │   │   │   └── pdf/route.ts                  # POST PDF export
│   │   │   ├── sheets/
│   │   │   │   └── sync/route.ts                 # POST Google Sheets sync
│   │   │   └── admin/
│   │   │       ├── lodging/
│   │   │       │   └── magic-generator/route.ts  # POST Room magic generator
│   │   │       ├── hard-reset-event/route.ts     # POST Event force reset
│   │   │       ├── registration/route.ts         # POST Manual registration
│   │   │       ├── refund/route.ts               # POST Process refund
│   │   │       ├── payment/
│   │   │       │   └── manual/route.ts           # POST Manual payment processing
│   │   │       ├── stripe-config/route.ts        # GET Stripe config management
│   │   │       ├── invoices/
│   │   │       │   └── custom/route.ts           # POST Create custom invoice
│   │   │       └── app-config/route.ts           # GET App configuration
│   │   ├── layout.tsx                            # Root layout
│   │   └── not-found.tsx
│   ├── components/
│   │   ├── ui/                                   # shadcn/ui components
│   │   ├── auth/
│   │   │   ├── oauth-buttons.tsx
│   │   │   └── profile-form.tsx
│   │   ├── registration/
│   │   │   ├── wizard-stepper.tsx
│   │   │   ├── date-range-picker.tsx
│   │   │   └── meal-selection-grid.tsx           # meal-selector equivalent
│   │   ├── payment/
│   │   │   ├── stripe-checkout.tsx
│   │   │   └── payment-method-selector.tsx
│   │   ├── checkin/
│   │   │   ├── scan-result-card.tsx              # checkin-result equivalent
│   │   │   └── recent-checkins.tsx
│   │   ├── admin/
│   │   │   ├── admin-sidebar.tsx                 # sidebar equivalent
│   │   │   └── confirm-delete-dialog.tsx
│   │   └── shared/
│   │       ├── language-switcher.tsx             # locale-switcher equivalent
│   │       ├── theme-toggle.tsx
│   │       ├── birth-date-picker.tsx
│   │       ├── theme-provider.tsx
│   │       ├── toolbar.tsx
│   │       ├── user-menu.tsx
│   │       ├── phone-input.tsx
│   │       ├── password-input.tsx
│   │       ├── church-combobox.tsx
│   │       ├── adventist-logo.tsx
│   │       ├── eckcm-logo.tsx
│   │       ├── color-theme-provider.tsx
│   │       ├── top-header.tsx
│   │       ├── site-footer.tsx
│   │       └── turnstile-widget.tsx              # Cloudflare Turnstile bot protection
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                         # Browser client
│   │   │   ├── server.ts                         # Server client
│   │   │   ├── middleware.ts                      # Auth middleware
│   │   │   └── admin.ts                          # Service role client
│   │   ├── stripe/
│   │   │   ├── client.ts                         # Stripe client
│   │   │   └── config.ts                         # Stripe config (test/live)
│   │   ├── email/
│   │   │   ├── resend.ts                         # Resend client
│   │   │   ├── send-confirmation.ts              # Confirmation send helper
│   │   │   └── templates/
│   │   │       ├── confirmation.tsx              # Registration confirmation
│   │   │       ├── epass.tsx                      # E-Pass email
│   │   │       ├── invoice.tsx                    # Invoice email
│   │   │       └── session-attendance.tsx         # Session attendance
│   │   ├── services/
│   │   │   ├── pricing.service.ts                # Fee calculation engine
│   │   │   ├── confirmation-code.service.ts      # 6-char code generator
│   │   │   ├── epass.service.ts                  # E-Pass / QR token
│   │   │   ├── invoice.service.ts                # Invoice creation service
│   │   │   ├── checkin.service.ts                # Check-in logic
│   │   │   ├── registration.service.ts           # Registration workflow
│   │   │   ├── lodging.service.ts                # Room assignment
│   │   │   ├── meal.service.ts                   # Meal pricing
│   │   │   ├── audit.service.ts                  # Audit logging
│   │   │   └── sheets.service.ts                 # Google Sheets sync
│   │   ├── hooks/
│   │   │   ├── use-auth.ts
│   │   │   ├── use-registration.ts
│   │   │   ├── use-realtime.ts
│   │   │   ├── use-offline-checkin.ts
│   │   │   └── use-mobile.tsx
│   │   ├── i18n/
│   │   │   ├── config.ts
│   │   │   ├── context.tsx
│   │   │   ├── en.json
│   │   │   └── ko.json
│   │   ├── utils/
│   │   │   ├── constants.ts
│   │   │   ├── validators.ts
│   │   │   ├── formatters.ts
│   │   │   ├── field-helpers.ts
│   │   │   └── profanity-filter.ts
│   │   └── types/
│   │       ├── database.ts                       # Supabase generated types
│   │       ├── registration.ts
│   │       ├── payment.ts
│   │       └── checkin.ts
│   └── middleware.ts                             # Next.js middleware (auth + i18n)
├── supabase/
│   └── migrations/                               # SQL migration files
├── next.config.ts
├── tailwind.config.ts
├── components.json                               # shadcn config
├── package.json
└── tsconfig.json
```

---

## 2. Database Schema (Detailed SQL)

> **Note on table naming**: ALL tables in the actual database use lowercase prefix `eckcm_` (e.g., `eckcm_users`, `eckcm_events`). The SQL below shows `eckcm_` prefix as lowercase throughout to match actual Postgres table names. PostgREST is case-sensitive.

### 2.1 Enums (v3 - Synced with implementation)

```sql
-- Custom enum types
CREATE TYPE eckcm_gender AS ENUM ('MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY');
CREATE TYPE eckcm_grade AS ENUM (
  'PRE_K', 'KINDERGARTEN',
  'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4',
  'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8',
  'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12'
);
CREATE TYPE eckcm_registration_status AS ENUM ('DRAFT', 'SUBMITTED', 'PAID', 'CANCELLED', 'REFUNDED');
CREATE TYPE eckcm_group_role AS ENUM ('REPRESENTATIVE', 'MEMBER');  -- Note: was LEADER in design v2
CREATE TYPE eckcm_member_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE eckcm_room_assign_status AS ENUM ('PENDING', 'ASSIGNED');
CREATE TYPE eckcm_pricing_type AS ENUM ('FLAT', 'PER_NIGHT', 'PER_MEAL', 'RULED');
CREATE TYPE eckcm_selection_mode AS ENUM ('AUTO', 'USER_SELECT', 'ADMIN_ONLY');
CREATE TYPE eckcm_meal_type AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER');
CREATE TYPE eckcm_checkin_type AS ENUM ('MAIN', 'DINING', 'SESSION', 'CUSTOM');
CREATE TYPE eckcm_checkin_source AS ENUM ('SELF', 'KIOSK');
CREATE TYPE eckcm_payment_status AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');
CREATE TYPE eckcm_payment_method AS ENUM ('CARD', 'APPLE_PAY', 'GOOGLE_PAY', 'ACH', 'CHECK', 'ZELLE', 'MANUAL');
CREATE TYPE eckcm_staff_role AS ENUM (
  'SUPER_ADMIN', 'EVENT_ADMIN', 'ROOM_COORDINATOR',
  'CHECKIN_STAFF', 'SESSION_CHECKIN_STAFF', 'DINING_CHECKIN_STAFF',
  'KEY_DEPOSIT_STAFF', 'PARTICIPANT', 'CUSTOM'
);
CREATE TYPE eckcm_church_role AS ENUM ('MEMBER', 'DEACON', 'ELDER', 'MINISTER', 'PASTOR');
```

### 2.2 Identity & Access Tables

> **Migration Order**: eckcm_events, eckcm_users, eckcm_roles, eckcm_permissions must be created before eckcm_staff_assignments (FK dependencies).

```sql
-- eckcm_users: extends Supabase auth.users
CREATE TABLE eckcm_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  auth_provider TEXT NOT NULL DEFAULT 'email', -- 'email' | 'google' | 'apple'
  profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
  locale TEXT NOT NULL DEFAULT 'en', -- 'en' | 'ko'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- eckcm_roles: predefined staff roles
CREATE TABLE eckcm_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name eckcm_staff_role NOT NULL UNIQUE,
  description_en TEXT,
  description_ko TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- eckcm_permissions: granular permissions
CREATE TABLE eckcm_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,  -- e.g., 'participant.read', 'checkin.main'
  description_en TEXT,
  description_ko TEXT,
  category TEXT NOT NULL      -- 'participant', 'checkin', 'group', 'lodging', etc.
);

-- eckcm_role_permissions: role <-> permission mapping
CREATE TABLE eckcm_role_permissions (
  role_id UUID NOT NULL REFERENCES eckcm_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES eckcm_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- eckcm_staff_assignments: staff per event
-- NOTE: eckcm_events must be created before this table
CREATE TABLE eckcm_staff_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES eckcm_users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES eckcm_events(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES eckcm_roles(id),
  custom_permissions UUID[] DEFAULT '{}', -- for CUSTOM role
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id, role_id)
);
```

### 2.2.1 SQL Migration Order

```
1. Enums (all CREATE TYPE statements)
2. eckcm_events
3. eckcm_users
4. eckcm_roles
5. eckcm_permissions
6. eckcm_role_permissions
7. eckcm_staff_assignments
8. eckcm_churches (global, no event_id)
9. eckcm_departments
10. eckcm_registration_groups
11. eckcm_fee_categories
12. eckcm_registration_group_fee_categories
13. eckcm_form_field_config
14. eckcm_people
15. eckcm_user_people
16. eckcm_registrations
17. eckcm_registration_drafts
18. eckcm_groups
19. eckcm_group_memberships
20. eckcm_registration_selections
21. eckcm_buildings -> eckcm_floors -> eckcm_rooms
22. eckcm_room_assignments
23. eckcm_meal_rules
24. eckcm_meal_selections
25. eckcm_invoices -> eckcm_invoice_line_items
26. eckcm_payments -> eckcm_refunds
27. eckcm_sessions
28. eckcm_checkins + Unique Indexes
29. eckcm_epass_tokens
30. eckcm_audit_logs, eckcm_notifications
31. eckcm_app_config, eckcm_airport_rides, eckcm_registration_rides
32. eckcm_legal_content
33. eckcm_sheets_cache_participants
34. Performance Indexes
35. RLS Functions + Policies
36. updated_at Trigger Functions
```

### 2.3 Event & Catalog Tables

```sql
-- eckcm_events
CREATE TABLE eckcm_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_ko TEXT,
  year INTEGER NOT NULL,
  event_start_date DATE NOT NULL,
  event_end_date DATE NOT NULL,
  registration_start_date TIMESTAMPTZ,
  registration_end_date TIMESTAMPTZ,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- eckcm_departments (Global scope - shared across all events)
CREATE TABLE eckcm_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_ko TEXT NOT NULL,
  short_code TEXT NOT NULL, -- upper case only
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(short_code)
);

-- eckcm_churches (Global scope - shared across all events, not event-specific)
CREATE TABLE eckcm_churches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  is_other BOOLEAN NOT NULL DEFAULT FALSE, -- "Other" always at top
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- eckcm_registration_groups (Global scope - shared across all events)
CREATE TABLE eckcm_registration_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_ko TEXT,
  description_en TEXT,
  description_ko TEXT,
  access_code TEXT, -- optional access code
  global_registration_fee_cents INTEGER,
  global_early_bird_fee_cents INTEGER,
  early_bird_deadline TIMESTAMPTZ,
  custom_registration_fee_cents INTEGER,
  custom_early_bird_fee_cents INTEGER,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- eckcm_fee_categories (Global scope - shared across all events)
CREATE TABLE eckcm_fee_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL, -- REG_FEE, LODGING_AC, LODGING_NON_AC, MEAL_ADULT, etc.
  name_en TEXT NOT NULL,
  name_ko TEXT,
  pricing_type eckcm_pricing_type NOT NULL DEFAULT 'FLAT',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}', -- additional pricing rules
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(code)
);

-- eckcm_registration_group_fee_categories: mapping
CREATE TABLE eckcm_registration_group_fee_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_group_id UUID NOT NULL REFERENCES eckcm_registration_groups(id) ON DELETE CASCADE,
  fee_category_id UUID NOT NULL REFERENCES eckcm_fee_categories(id) ON DELETE CASCADE,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  selection_mode eckcm_selection_mode NOT NULL DEFAULT 'USER_SELECT',
  constraints JSONB DEFAULT '{}', -- e.g., {"age_min": 4, "age_max": 8}
  override_amount_cents INTEGER, -- price override for this group
  UNIQUE(registration_group_id, fee_category_id)
);

-- eckcm_form_field_config: dynamic form field visibility
CREATE TABLE eckcm_form_field_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_group_id UUID NOT NULL REFERENCES eckcm_registration_groups(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL, -- e.g., 'airport_pickup', 'vbs_registration'
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(registration_group_id, field_key)
);
```

### 2.4 People & Registration Tables

```sql
-- eckcm_people: participant entity
-- NOTE: department_id is global-scoped (eckcm_departments has no event_id).
-- church_id is also global-scoped (eckcm_churches has no event_id).
-- Each person record is created per-registration, so a person participating
-- in multiple events will have separate person records per event.
CREATE TABLE eckcm_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  last_name_en TEXT NOT NULL,
  first_name_en TEXT NOT NULL,
  display_name_ko TEXT,
  gender eckcm_gender NOT NULL,
  birth_date DATE NOT NULL,
  age_at_event INTEGER, -- calculated from event start date
  is_k12 BOOLEAN NOT NULL DEFAULT FALSE,
  grade eckcm_grade,
  email TEXT,
  phone TEXT,
  department_id UUID REFERENCES eckcm_departments(id),
  church_id UUID REFERENCES eckcm_churches(id),
  church_other TEXT, -- when church = "Other"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- eckcm_user_people: user <-> person 1:1 link
CREATE TABLE eckcm_user_people (
  user_id UUID NOT NULL REFERENCES eckcm_users(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES eckcm_people(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, person_id),
  UNIQUE(user_id)
);

-- eckcm_registrations
CREATE TABLE eckcm_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES eckcm_events(id),
  created_by_user_id UUID NOT NULL REFERENCES eckcm_users(id),
  registration_group_id UUID NOT NULL REFERENCES eckcm_registration_groups(id),
  status eckcm_registration_status NOT NULL DEFAULT 'DRAFT',
  confirmation_code TEXT, -- 6-char alphanumeric, unique per event
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  nights_count INTEGER NOT NULL,
  total_amount_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, confirmation_code)
);

-- eckcm_registration_drafts: wizard state persistence
CREATE TABLE eckcm_registration_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES eckcm_users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES eckcm_events(id) ON DELETE CASCADE,
  draft_data JSONB NOT NULL DEFAULT '{}', -- wizard form state
  current_step TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id)
);

-- eckcm_registration_selections: fee selections per registration
CREATE TABLE eckcm_registration_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES eckcm_registrations(id) ON DELETE CASCADE,
  group_id UUID REFERENCES eckcm_groups(id),
  person_id UUID REFERENCES eckcm_people(id),
  fee_category_id UUID NOT NULL REFERENCES eckcm_fee_categories(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  metadata JSONB DEFAULT '{}', -- e.g., {"nights": 3, "room_type": "AC"}
  computed_amount_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- eckcm_groups: room groups
CREATE TABLE eckcm_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES eckcm_events(id),
  registration_id UUID NOT NULL REFERENCES eckcm_registrations(id) ON DELETE CASCADE,
  display_group_code TEXT NOT NULL, -- G0001
  room_assign_status eckcm_room_assign_status NOT NULL DEFAULT 'PENDING',
  preferences JSONB DEFAULT '{}', -- {"elderly": false, "handicapped": false, "first_floor": false}
  key_count INTEGER NOT NULL DEFAULT 1, -- min 1, max 2
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, display_group_code)
);

-- eckcm_group_memberships
CREATE TABLE eckcm_group_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES eckcm_groups(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES eckcm_people(id),
  role eckcm_group_role NOT NULL DEFAULT 'MEMBER',  -- REPRESENTATIVE | MEMBER
  status eckcm_member_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, person_id)
);
```

### 2.5 Lodging Tables

```sql
-- eckcm_buildings
CREATE TABLE eckcm_buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES eckcm_events(id) ON DELETE CASCADE,
  name_en TEXT NOT NULL,
  name_ko TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- eckcm_floors
CREATE TABLE eckcm_floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES eckcm_buildings(id) ON DELETE CASCADE,
  floor_number INTEGER NOT NULL,
  name_en TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(building_id, floor_number)
);

-- eckcm_rooms
CREATE TABLE eckcm_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES eckcm_floors(id) ON DELETE CASCADE,
  room_number TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 2,
  has_ac BOOLEAN NOT NULL DEFAULT FALSE,
  fee_per_night_cents INTEGER NOT NULL DEFAULT 0,
  is_accessible BOOLEAN NOT NULL DEFAULT FALSE,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(floor_id, room_number)
);

-- eckcm_room_assignments
CREATE TABLE eckcm_room_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES eckcm_groups(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES eckcm_rooms(id),
  assigned_by UUID REFERENCES eckcm_users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  UNIQUE(group_id, room_id)
);
```

### 2.6 Meal Tables

```sql
-- eckcm_meal_rules
CREATE TABLE eckcm_meal_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES eckcm_events(id) ON DELETE CASCADE UNIQUE,
  meal_start_date DATE NOT NULL,
  meal_end_date DATE NOT NULL,
  no_meal_dates DATE[] DEFAULT '{}',
  adult_price_each_cents INTEGER NOT NULL DEFAULT 1800,    -- $18
  youth_price_each_cents INTEGER NOT NULL DEFAULT 1000,    -- $10
  adult_price_day_cents INTEGER NOT NULL DEFAULT 4500,     -- $45
  youth_price_day_cents INTEGER NOT NULL DEFAULT 2500,     -- $25
  free_under_age INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- eckcm_meal_selections
CREATE TABLE eckcm_meal_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES eckcm_events(id),
  registration_id UUID NOT NULL REFERENCES eckcm_registrations(id) ON DELETE CASCADE,
  group_id UUID REFERENCES eckcm_groups(id),
  person_id UUID NOT NULL REFERENCES eckcm_people(id),
  meal_date DATE NOT NULL,
  meal_type eckcm_meal_type NOT NULL,
  selected BOOLEAN NOT NULL DEFAULT TRUE,
  price_applied_cents INTEGER NOT NULL DEFAULT 0,
  UNIQUE(registration_id, person_id, meal_date, meal_type)
);
```

### 2.7 Payment & Invoice Tables

```sql
-- eckcm_invoices
CREATE TABLE eckcm_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES eckcm_registrations(id),
  invoice_number TEXT NOT NULL UNIQUE, -- auto-generated
  total_cents INTEGER NOT NULL DEFAULT 0,
  status eckcm_payment_status NOT NULL DEFAULT 'PENDING',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- eckcm_invoice_line_items: snapshot at payment time
CREATE TABLE eckcm_invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES eckcm_invoices(id) ON DELETE CASCADE,
  description_en TEXT NOT NULL,
  description_ko TEXT,
  fee_category_code TEXT,
  person_name TEXT, -- snapshot
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- eckcm_payments
CREATE TABLE eckcm_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES eckcm_invoices(id),
  stripe_payment_intent_id TEXT,
  payment_method eckcm_payment_method NOT NULL,
  amount_cents INTEGER NOT NULL,
  status eckcm_payment_status NOT NULL DEFAULT 'PENDING',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- eckcm_refunds
CREATE TABLE eckcm_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES eckcm_payments(id),
  stripe_refund_id TEXT,
  amount_cents INTEGER NOT NULL,
  reason TEXT,
  refunded_by UUID REFERENCES eckcm_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.8 Check-in Tables

```sql
-- eckcm_sessions
CREATE TABLE eckcm_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES eckcm_events(id),
  name_en TEXT NOT NULL,
  name_ko TEXT,
  session_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES eckcm_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- eckcm_checkins
CREATE TABLE eckcm_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES eckcm_events(id),
  person_id UUID NOT NULL REFERENCES eckcm_people(id),
  checkin_type eckcm_checkin_type NOT NULL,
  session_id UUID REFERENCES eckcm_sessions(id),
  meal_date DATE,
  meal_type eckcm_meal_type,
  source eckcm_checkin_source NOT NULL DEFAULT 'SELF',
  device_id TEXT,
  nonce TEXT, -- for idempotent offline sync
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique indexes for idempotent check-in
CREATE UNIQUE INDEX idx_checkin_main
  ON eckcm_checkins(event_id, person_id, checkin_type)
  WHERE checkin_type = 'MAIN';

CREATE UNIQUE INDEX idx_checkin_dining
  ON eckcm_checkins(event_id, person_id, meal_date, meal_type)
  WHERE checkin_type = 'DINING';

CREATE UNIQUE INDEX idx_checkin_session
  ON eckcm_checkins(event_id, person_id, session_id)
  WHERE checkin_type = 'SESSION';

-- eckcm_epass_tokens: QR token for check-in
CREATE TABLE eckcm_epass_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES eckcm_people(id),
  registration_id UUID NOT NULL REFERENCES eckcm_registrations(id),
  token TEXT NOT NULL UNIQUE, -- opaque token for QR
  token_hash TEXT NOT NULL,   -- for server verification
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.9 Audit, System & Legal Tables (v3 - Synced with implementation)

```sql
-- eckcm_audit_logs
CREATE TABLE eckcm_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES eckcm_events(id),
  user_id UUID REFERENCES eckcm_users(id),
  action TEXT NOT NULL,          -- 'registration.create', 'payment.refund', etc.
  entity_type TEXT NOT NULL,     -- 'registration', 'payment', 'person', etc.
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- eckcm_notifications: in-app realtime notifications
CREATE TABLE eckcm_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES eckcm_users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES eckcm_events(id),
  title_en TEXT NOT NULL,
  title_ko TEXT,
  body_en TEXT,
  body_ko TEXT,
  type TEXT NOT NULL, -- 'registration', 'payment', 'checkin', 'system'
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- eckcm_app_config: global app configuration (replaces eckcm_system_settings)
-- Note: was named ECKCM_system_settings in design v2; actual DB uses eckcm_app_config
CREATE TABLE eckcm_app_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES eckcm_events(id) ON DELETE CASCADE UNIQUE,
  registration_open BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_mode TEXT NOT NULL DEFAULT 'test', -- 'test' | 'live'
  stripe_test_key_enc TEXT,
  stripe_live_key_enc TEXT,
  google_sheet_id TEXT,
  google_sheet_range TEXT,
  sheet_refresh_interval_min INTEGER DEFAULT 30,
  resend_api_key_enc TEXT,
  additional_lodging_threshold INTEGER DEFAULT 3,
  additional_lodging_fee_cents INTEGER DEFAULT 400, -- $4
  vbs_fee_cents INTEGER DEFAULT 1500,               -- $15
  key_deposit_cents INTEGER DEFAULT 6500,            -- $65
  settings JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- eckcm_airport_rides: available ride options (replaces eckcm_airport_pickups)
-- Note: was a single eckcm_airport_pickups table in design v2; split into two for normalization
CREATE TABLE eckcm_airport_rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES eckcm_events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,           -- e.g., "JFK Friday 5pm shuttle"
  airport_code TEXT NOT NULL,   -- e.g., 'JFK', 'EWR', 'LGA'
  direction TEXT NOT NULL,      -- 'ARRIVAL' | 'DEPARTURE'
  datetime TIMESTAMPTZ NOT NULL,
  capacity INTEGER,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- eckcm_registration_rides: per-registration ride selections
CREATE TABLE eckcm_registration_rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES eckcm_registrations(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES eckcm_people(id),
  ride_id UUID NOT NULL REFERENCES eckcm_airport_rides(id),
  flight_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(registration_id, person_id, ride_id)
);

-- eckcm_legal_content: terms/privacy CMS
CREATE TABLE eckcm_legal_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL UNIQUE, -- 'terms' | 'privacy'
  title_en TEXT NOT NULL,
  title_ko TEXT,
  body_en TEXT NOT NULL,
  body_ko TEXT,
  version TEXT,
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- eckcm_sheets_cache_participants: Google Sheets sync cache
CREATE TABLE eckcm_sheets_cache_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES eckcm_events(id),
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 3. RLS (Row Level Security) Functions & Policies

### 3.1 Helper Functions

```sql
-- Check if user has event-scoped permission
CREATE OR REPLACE FUNCTION has_event_permission(
  p_user_id UUID,
  p_event_id UUID,
  p_permission_code TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM eckcm_staff_assignments sa
    JOIN eckcm_role_permissions rp ON rp.role_id = sa.role_id
    JOIN eckcm_permissions p ON p.id = rp.permission_id
    WHERE sa.user_id = p_user_id
      AND sa.event_id = p_event_id
      AND sa.is_active = TRUE
      AND p.code = p_permission_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM eckcm_staff_assignments sa
    JOIN eckcm_roles r ON r.id = sa.role_id
    WHERE sa.user_id = p_user_id
      AND r.name = 'SUPER_ADMIN'
      AND sa.is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is member of group
CREATE OR REPLACE FUNCTION is_member_of_group(
  p_user_id UUID,
  p_group_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM eckcm_group_memberships gm
    JOIN eckcm_user_people up ON up.person_id = gm.person_id
    WHERE up.user_id = p_user_id
      AND gm.group_id = p_group_id
      AND gm.status = 'ACTIVE'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user owns registration
CREATE OR REPLACE FUNCTION owns_registration(
  p_user_id UUID,
  p_registration_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM eckcm_registrations
    WHERE id = p_registration_id
      AND created_by_user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

### 3.2 Key RLS Policies (Examples)

```sql
-- eckcm_registrations: owner can read their own
ALTER TABLE eckcm_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own registrations"
  ON eckcm_registrations FOR SELECT
  USING (created_by_user_id = auth.uid());

CREATE POLICY "Staff can read all registrations"
  ON eckcm_registrations FOR SELECT
  USING (has_event_permission(auth.uid(), event_id, 'participant.read'));

CREATE POLICY "Users can create registrations"
  ON eckcm_registrations FOR INSERT
  WITH CHECK (created_by_user_id = auth.uid());

-- eckcm_people: accessible via registration ownership or group membership
ALTER TABLE eckcm_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read people in their groups"
  ON eckcm_people FOR SELECT
  USING (
    id IN (
      SELECT gm.person_id FROM eckcm_group_memberships gm
      JOIN eckcm_groups g ON g.id = gm.group_id
      JOIN eckcm_registrations r ON r.id = g.registration_id
      WHERE r.created_by_user_id = auth.uid()
    )
    OR id IN (
      SELECT person_id FROM eckcm_user_people WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can read all people"
  ON eckcm_people FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM eckcm_staff_assignments
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );
```

---

## 4. API Route Design (v4 - Synced with implementation)

### 4.0 Data Access Strategy

> **Supabase Client SDK vs API Routes**
>
> This project uses a **hybrid approach**:
> - **Read (SELECT)**: Supabase Client SDK with RLS policies (direct DB access from client)
> - **Simple CRUD (INSERT/UPDATE/DELETE)**: Supabase Client SDK with RLS (admin tables, settings)
> - **API Routes**: Only for operations requiring **server-side business logic**, **external service calls**, or **multi-step transactions**
>
> | Operation Type | Method | Reason |
> |---------------|--------|--------|
> | Admin CRUD (events, depts, churches, fees, etc.) | Supabase Client SDK + RLS | Simple CRUD, RLS enforces permissions |
> | User profile read/update | Supabase Client SDK + RLS | Owner-based RLS |
> | Registration read | Supabase Client SDK + RLS | Owner/staff RLS |
> | Participants data table | Supabase Client SDK + RLS | Staff RLS with filters |
> | Registration submit | API Route | Multi-table transaction (reg + groups + members + selections + meals) |
> | Price estimate | API Route | Complex server-side calculation |
> | Payment | API Route | Stripe server-side SDK required |
> | Check-in verify | API Route | QR token hash verification + idempotent insert |
> | Email send | API Route | Resend server-side SDK required |
> | Export (CSV/PDF) | API Route | Server-side file generation |
> | Google Sheets sync | API Route | External API call |
> | Room magic generator | API Route | Bulk insert logic |
> | Event force reset | API Route | Super admin + confirmation password |
> | Donation | API Route | Stripe PaymentIntent |

### 4.1 Auth Routes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/auth/callback` | OAuth callback handler | Public |
| - | Supabase client SDK | signUp, signIn, signOut, resetPassword | Direct |

### 4.2 Registration Routes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/registration/estimate` | Calculate price estimate | User |
| POST | `/api/registration/submit` | Submit registration (atomic: reg + groups + members + selections + meals) | User |
| POST | `/api/registration/[id]/cancel` | Request cancellation | User (owner) |
| GET | `/api/registration/[id]/event-id` | Get event ID for a registration | User |

### 4.3 Payment Routes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/payment/create-intent` | Create Stripe PaymentIntent | User |
| POST | `/api/payment/confirm` | Confirm payment synchronously (server-side) | User |
| GET | `/api/payment/retrieve-intent` | Retrieve PaymentIntent status | User |
| POST | `/api/payment/zelle-submit` | Submit Zelle payment | User |
| GET | `/api/payment/methods` | Get available payment methods | User |
| POST | `/api/payment/update-cover-fees` | Update cover-processing-fees flag on payment | User |
| POST | `/api/payment/donate` | Create donation PaymentIntent | Public |
| GET | `/api/stripe/publishable-key` | Get Stripe publishable key | Public |

> **v4 Note**: `POST /api/webhooks/stripe` was intentionally removed in commit `27e23d8` ("webhook cleanup"). Payment confirmation is now handled **synchronously** via `POST /api/payment/confirm` which updates registration status, invoice, and triggers confirmation email all in a single server-side call after Stripe's `confirmPayment()` succeeds on the client. The webhook approach has been replaced by this synchronous flow. Stripe webhook secrets remain configurable in admin settings for potential future use.

### 4.4 Check-in Routes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/checkin/verify` | Verify QR token + record check-in | Staff |
| POST | `/api/checkin/batch-sync` | Batch upload offline check-ins | Staff |
| GET | `/api/checkin/epass-cache` | Download full participant allowlist for offline cache | Staff |
| GET | `/api/checkin/delta` | Download changes since timestamp for delta sync | Staff |
| GET | `/api/checkin/stats` | Check-in statistics | Staff |

### 4.5 Email Routes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/email/confirmation` | Send registration confirmation (to group representative) | Server |
| POST | `/api/email/invoice` | Send invoice email | Server |
| POST | `/api/email/test` | Test email delivery | Staff |
| GET | `/api/admin/email/logs` | View email delivery log | Staff |
| POST | `/api/admin/email/send` | Admin send confirmation/invoice for a registration | Staff |
| GET+PUT | `/api/admin/email/config` | Read/update email configuration (Resend key, from address) | Super Admin |
| POST | `/api/admin/email/announcement` | Send bulk announcement email to all registrants | Staff |

### 4.6 Admin Routes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/admin/lodging/magic-generator` | Generate rooms for building | Staff |
| POST | `/api/admin/hard-reset-event` | Force reset event (super admin + password) | Super Admin |
| POST | `/api/admin/invoices/custom` | Create custom invoice | Staff |
| POST | `/api/admin/registration` | Manual registration (admin creates for participant) | Staff |
| POST | `/api/admin/refund` | Process refund (full/partial) | Staff |
| GET | `/api/admin/refund/info` | Get refund summary info for a payment | Staff |
| POST | `/api/admin/payment/manual` | Process manual payment | Staff |
| GET | `/api/admin/stripe-config` | Stripe configuration | Super Admin |
| POST | `/api/admin/stripe-sync` | Sync Stripe payment intents with DB | Super Admin |
| GET | `/api/admin/app-config` | App configuration | Staff |
| GET | `/api/admin/events/[eventId]` | Event detail API (read single event) | Staff |
| GET | `/api/admin/registration/status` | Registration open/closed status check | Public |
| POST | `/api/export/csv` | Export data as CSV | Staff |
| POST | `/api/export/pdf` | Export data as PDF | Staff |
| POST | `/api/sheets/sync` | Trigger Google Sheets sync | Staff |
| GET | `/api/epass/[token]` | Public E-Pass viewer | Public |

### 4.7 Standard API Response Format

```typescript
// Success response
{ data: T, meta?: { total?: number, page?: number } }

// Error response
{ error: { code: string, message: string, details?: unknown } }

// Error codes
type ErrorCode =
  | 'AUTH_REQUIRED'          // 401 - Not authenticated
  | 'FORBIDDEN'              // 403 - No permission
  | 'NOT_FOUND'              // 404 - Resource not found
  | 'VALIDATION_ERROR'       // 422 - Invalid input
  | 'DUPLICATE_EMAIL'        // 409 - Email already exists
  | 'REGISTRATION_CLOSED'    // 409 - Registration not open
  | 'PAYMENT_FAILED'         // 402 - Stripe payment failed
  | 'CAPACITY_EXCEEDED'      // 409 - Room/group capacity exceeded
  | 'ALREADY_CHECKED_IN'     // 409 - Duplicate check-in attempt
  | 'INVALID_QR_TOKEN'       // 400 - QR token invalid or expired
  | 'INTERNAL_ERROR';        // 500 - Server error
```

---

## 5. Key Service Designs (v4 - Synced with implementation)

### 5.1 PricingService (`pricing.service.ts`)

```
Inputs:
  - registration data (dates, participants per group)
  - fee categories for the registration group
  - meal selections
  - person ages (for youth/adult/free classification)

Logic:
  1. Registration Fee: FLAT per person (early bird check by deadline)
  2. Lodging: PER_NIGHT × nights × room type (AC/Non-AC)
     - Additional lodging: if group size >= threshold, +$4/night/extra person
  3. Meals: per person × per day × meal_type
     - Full-day discount: if 3 meals selected for a day, apply day rate
     - Free for under-4 (event start date basis)
  4. VBS: FLAT for eligible age range (4-8, Pre-K to 3rd grade)
  5. Key Deposit: FLAT × key count

Output:
  - line items array with description, quantity, unit_price, total
  - grand total
```

### 5.2 ConfirmationCodeService (`confirmation-code.service.ts`)

```
Character set: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no 0/O/1/I/L)
Length: 6
Scope: unique per (event_id, confirmation_code)
Profanity filter: substring match against blocklist (EN/KO)
Retry: up to 10 attempts on collision or profanity match
```

### 5.3 E-Pass & QR Service (`epass.service.ts`)

```
Token: crypto.randomUUID() -> base64url -> first 32 chars
Token hash: SHA-256(token) stored in DB
QR Content: URL -> /epass/{token}
Verification: hash comparison, check is_active + registration status
```

### 5.4 Invoice Service (`invoice.service.ts`)

```
Creates invoices and line items from registration selections.
Generates invoice_number (auto-generated, unique).
Snapshot of line items at payment time.
```

### 5.5 Offline Check-in Flow

```
1. Baseline Download (pre-event):
   - GET /api/checkin/epass-cache?event_id=X
   - Returns: person_id, display_name, confirmation_code, group_code, qr_token_hash
   - Store in IndexedDB with version timestamp

2. Delta Sync (periodic):
   - GET /api/checkin/delta?event_id=X&since=TIMESTAMP
   - Returns: changed/cancelled/new records since timestamp
   - Merge into IndexedDB

3. Offline Check-in:
   - Scan QR -> extract token
   - Hash locally -> match against IndexedDB
   - Record in pending_checkins queue with nonce

4. Online Sync:
   - POST /api/checkin/batch-sync with pending_checkins array
   - Server: idempotent insert (ON CONFLICT DO NOTHING using nonce)
   - Clear synced items from local queue
```

---

## 6. State Management

### 6.1 Server State (Supabase + React Query / SWR)
- All database reads via Supabase client SDK with RLS
- Real-time subscriptions for notifications and check-in updates
- Server Components for initial data loading (Next.js App Router)

### 6.2 Client State
- **Registration Wizard**: React Context (`RegistrationContext`) for multi-step form state
  - Persisted to `sessionStorage` to survive page refreshes
  - Also persisted to `eckcm_registration_drafts` table for cross-device continuity
  - Shape: `{ step, dates, groups[], participants[], meals[], lodging, keyDeposit, pickup }`
- **Auth**: Supabase `onAuthStateChange` + React Context
- **i18n**: Cookie-based locale with custom i18n context implementation
- **Theme**: `next-themes` for dark mode
- **Offline Check-in**: IndexedDB via `idb` library

---

## 7. i18n Strategy

```
Route pattern: /{locale}/... where locale = 'en' | 'ko'
Default: 'en'
Middleware: detect Accept-Language header, cookie override

DB columns: name_en, name_ko, description_en, description_ko
Frontend: translation JSON files (en.json, ko.json) for UI strings
Admin UI: both language inputs visible simultaneously
```

---

## 8. Key Indexes

```sql
-- Performance indexes
CREATE INDEX idx_registrations_event ON eckcm_registrations(event_id);
CREATE INDEX idx_registrations_user ON eckcm_registrations(created_by_user_id);
CREATE INDEX idx_registrations_status ON eckcm_registrations(event_id, status);
CREATE INDEX idx_people_email ON eckcm_people(email);
CREATE INDEX idx_group_memberships_person ON eckcm_group_memberships(person_id);
CREATE INDEX idx_group_memberships_group ON eckcm_group_memberships(group_id);
CREATE INDEX idx_staff_assignments_user ON eckcm_staff_assignments(user_id, event_id);
CREATE INDEX idx_checkins_event_person ON eckcm_checkins(event_id, person_id);
CREATE INDEX idx_meal_selections_reg ON eckcm_meal_selections(registration_id);
CREATE INDEX idx_audit_logs_event ON eckcm_audit_logs(event_id, created_at DESC);
CREATE INDEX idx_notifications_user ON eckcm_notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_epass_tokens_token_hash ON eckcm_epass_tokens(token_hash);
```

---

## 9. Implementation Order

| # | Phase | Key Deliverables | Dependencies |
|---|-------|------------------|-------------|
| 1 | Project Setup | Next.js, Supabase, Tailwind, shadcn/ui, PWA config | None |
| 2 | Auth & Profile | OAuth, signup, profile form, forgot/reset password, Person creation | Phase 1 |
| 3 | Event & Catalog | Events, Registration Groups, Fee Categories, Depts, Churches | Phase 1 |
| 4 | Registration Wizard | 5-step form + instructions, estimate calculation, draft submission | Phase 2, 3 |
| 5 | Payment | Stripe + Zelle integration, webhook, confirmation code, E-Pass | Phase 4 |
| 6 | Profile Dashboard | E-Pass view, receipts, registration info, change request | Phase 5 |
| 7 | Admin: Core | Settings, events, participants table, users/permissions, roles | Phase 3 |
| 8 | Admin: Lodging | Buildings, rooms, magic generator, room assignment, lodging settings | Phase 7 |
| 9 | Meals | Meal rules, selections, pricing integration | Phase 4 |
| 10 | Check-in | Self, kiosk, session check-in, offline hybrid | Phase 5 |
| 11 | Invoice & Print | Invoice management, lanyard/QR card print, airport, inventory | Phase 5, 7 |
| 12 | Audit & Comms | Audit logs, email notifications, realtime, Google Sheets | Phase 7 |
| 13 | Legal & Compliance | Terms/privacy pages, legal content management | Phase 1 |
| 14 | i18n & Dark Mode | Korean/English, theme switching | All phases |
| 15 | Polish & Deploy | Testing, PWA optimization, Vercel deployment | All phases |

---

## 10. Third-Party Integration Details (v3 - Synced with implementation)

### 10.1 Stripe
- **SDK**: `@stripe/stripe-js` + `@stripe/react-stripe-js` (client), `stripe` (server)
- **Flow**: Create PaymentIntent (server) -> Confirm with Elements (client) -> Synchronous server confirmation via `POST /api/payment/confirm`
- **Confirmation Flow**: After client-side `stripe.confirmPayment()` succeeds, the client calls `POST /api/payment/confirm` which: updates registration status to PAID, updates invoice, inserts payment record, generates confirmation code, generates E-Pass tokens, sends confirmation and invoice emails, and inserts audit log. This replaces the previous async webhook approach.
- **Config**: Test/Live mode toggle in admin settings (encrypted keys in DB)
- **Methods**: Card, Apple Pay, Google Pay, ACH (us_bank_account), Link
- **Note**: Must use lazy `getStripeServer()` function, not module-level instantiation

### 10.2 Zelle
- **Flow**: User selects Zelle as payment method -> system displays Zelle recipient info (Zelle ID, name, memo format) -> user submits confirmation via `POST /api/payment/zelle-submit`
- **Memo format**: Includes 10-digit confirmation code for reconciliation
- **Manual confirmation**: Admin manually verifies Zelle receipt and marks payment as received via `POST /api/admin/payment/manual`
- **Agreement**: User must agree to terms before Zelle submission

### 10.3 Resend
- **SDK**: `resend` npm package
- **Templates**: React Email components (JSX)
- **Triggers**: Registration confirmation, E-Pass delivery, invoice, session attendance

### 10.4 Google Sheets
- **Method**: Edge Function (cron) reads Google Sheets API -> writes to cache table
- **Config**: Sheet ID + range stored in app config
- **RLS**: Only staff can access cached data

### 10.5 Supabase Realtime
- **Channels**: `notifications:{user_id}` for personal alerts
- **Events**: New registration, payment confirmation, room assignment, check-in
- **Client**: `supabase.channel()` subscription in `useRealtime` hook

### 10.6 Cloudflare Turnstile
- **Purpose**: Bot protection on public-facing forms (signup, payment, etc.)
- **Component**: `shared/turnstile-widget.tsx`
- **Verification**: Server-side token verification before processing sensitive actions

---

## 11. PWA Configuration

```json
// next.config.ts - next-pwa or serwist integration
{
  "skipWaiting": true,
  "runtimeCaching": [
    { "urlPattern": "/api/checkin/*", "handler": "NetworkFirst" },
    { "urlPattern": "/_next/static/*", "handler": "CacheFirst" },
    { "urlPattern": "/epass/*", "handler": "NetworkFirst" }
  ]
}
```

- Service Worker: `skipWaiting: true` for immediate activation
- Offline: Check-in pages cached for offline use
- IndexedDB: Baseline participant data for offline QR verification

---

## 12. Business Validation Rules

### 12.1 Registration Constraints

| Rule | Value | Enforced At |
|------|-------|-------------|
| Max room groups per registration | 4 | Client + Server |
| Max participants per room group | 6 | Client + Server |
| Adults per group | 0 - 4 | Client + Server |
| K-12 per group | 0 - 6 | Client + Server |
| Infant/Toddlers (0-4 yrs) per group | 0 - 5 (requires at least 1 adult) | Client + Server |
| Date range | Must be within event dates, no gaps | Client + Server |
| Minimum stay | 1 night | Client + Server |
| Key deposit per room | min 1, max 2 | Client + Server |
| Access code | Optional, validated against registration group | Server |

### 12.2 Age Classification (based on event start date)

| Classification | Rule |
|---------------|------|
| Adult | age >= 18 at event start |
| Youth (K-12) | age < 18 at event start |
| Infant/Toddler | age <= 4 at event start (meal free) |
| VBS eligible | age 4-8, Pre-K to 3rd Grade |

### 12.3 Auth Validation

| Rule | Description |
|------|-------------|
| Email uniqueness | All auth methods (Google, Apple, Email) share single email namespace |
| Confirm Email field | Required during Email/Password signup (client-side match + server duplicate check) |
| Google OAuth email | Cannot change in profile settings (read-only) |
| Profile completion | Required after OAuth signup before accessing dashboard |

### 12.4 Email/Password Signup UI Flow

- **OAuth (Google, Apple)**: 2-step flow
  1. `/signup` - OAuth button click -> redirect
  2. `/signup/complete-profile` - Personal info form
- **Email/Password**: Single-page flow
  1. `/signup` - Email, Confirm Email, Password + Personal info all on same page
  - Component: `signup-form.tsx` with conditional rendering based on auth method

---

## 13. Permission Seed Data

### 13.1 Permission Codes

```sql
INSERT INTO eckcm_permissions (code, category, description_en) VALUES
-- Participant management
('participant.read', 'participant', 'View participant info'),
('participant.update', 'participant', 'Edit participant info'),
('participant.delete', 'participant', 'Delete participant (super admin)'),
('participant.export', 'participant', 'Export participant data'),
-- Check-in
('checkin.main', 'checkin', 'Main event check-in'),
('checkin.session', 'checkin', 'Session check-in'),
('checkin.dining', 'checkin', 'Dining check-in'),
-- Group management
('group.read', 'group', 'View groups'),
('group.create', 'group', 'Create groups'),
('group.update', 'group', 'Edit groups'),
('group.delete', 'group', 'Delete groups'),
('group.member.assign', 'group', 'Assign member to group'),
('group.member.remove', 'group', 'Remove member from group'),
('group.member.transfer', 'group', 'Transfer member between groups'),
('group.leader.assign', 'group', 'Change group representative'),
('group.checkin.view', 'group', 'View group check-in status'),
('group.roster.export', 'group', 'Export group roster (CSV/PDF)'),
('group.roster.print', 'group', 'Print group roster'),
-- Lodging
('lodging.read', 'lodging', 'View lodging info'),
('lodging.manage', 'lodging', 'Manage buildings/rooms'),
('lodging.assign', 'lodging', 'Assign rooms to groups'),
-- Invoice & Payment
('invoice.read', 'invoice', 'View invoices'),
('invoice.create', 'invoice', 'Create custom invoices'),
('invoice.send', 'invoice', 'Send invoices via email'),
('payment.refund', 'payment', 'Process refunds'),
-- Settings & Events
('settings.manage', 'settings', 'Manage system settings'),
('event.manage', 'event', 'Manage events'),
('event.reset', 'event', 'Force reset event (super admin)'),
-- Users
('user.manage', 'user', 'Manage users and staff assignments'),
-- Audit
('audit.read', 'audit', 'View audit logs'),
-- Print
('print.lanyard', 'print', 'Print lanyards'),
('print.qrcard', 'print', 'Print QR cards');
```

### 13.2 Default Role-Permission Mapping

| Role | Permissions |
|------|------------|
| SUPER_ADMIN | All permissions |
| EVENT_ADMIN | All except event.reset, user.manage |
| ROOM_COORDINATOR | lodging.*, group.read, participant.read |
| CHECKIN_STAFF | checkin.main, participant.read, group.checkin.view |
| SESSION_CHECKIN_STAFF | checkin.session, participant.read |
| DINING_CHECKIN_STAFF | checkin.dining, participant.read |
| KEY_DEPOSIT_STAFF | participant.read, group.read |
| PARTICIPANT | No admin permissions |
| CUSTOM | Selected from above list per user |

---

## 14. Registration Transaction Strategy

### Submit-at-Once Pattern

The registration wizard collects all data client-side via `RegistrationContext` (persisted to `sessionStorage` and `eckcm_registration_drafts`). On final submit, a **single API call** (`POST /api/registration/submit`) executes an **atomic database transaction**:

```
Transaction: POST /api/registration/submit
├─ 1. Validate all input data (dates, participants, meals, fees)
├─ 2. INSERT eckcm_registrations (status: SUBMITTED)
├─ 3. INSERT eckcm_people (for each new participant)
├─ 4. INSERT eckcm_groups (for each room group)
├─ 5. INSERT eckcm_group_memberships (representative + members)
├─ 6. INSERT eckcm_registration_selections (fee choices)
├─ 7. INSERT eckcm_meal_selections (per person × date × type)
├─ 8. INSERT eckcm_registration_rides (if airport ride selected)
├─ 9. Calculate total via PricingService
├─ 10. INSERT eckcm_invoices + eckcm_invoice_line_items (snapshot)
└─ COMMIT or ROLLBACK on any error
```

After payment confirmation (synchronous server call):
```
POST /api/payment/confirm (called by client after stripe.confirmPayment() succeeds)
├─ 1. Verify payment intent status with Stripe server SDK
├─ 2. UPDATE eckcm_registrations (status: PAID)
├─ 3. UPDATE eckcm_invoices (status: SUCCEEDED, paid_at)
├─ 4. INSERT eckcm_payments
├─ 5. Generate confirmation_code (ConfirmationCodeService)
├─ 6. Generate eckcm_epass_tokens (for each participant)
├─ 7. Send confirmation email to group representative (all confirmation codes + E-Pass links)
├─ 8. Send invoice email
└─ 9. INSERT eckcm_audit_logs
```

> **v4 Architecture Note**: The original design used `POST /api/webhooks/stripe` for async payment confirmation. This was intentionally replaced by the synchronous confirm flow above. The synchronous approach eliminates webhook signature verification complexity and ensures immediate confirmation delivery. The webhook endpoint has been removed from the codebase.

---

## 15. Email Delivery Policy

| Trigger | Recipient | Content |
|---------|-----------|---------|
| Registration confirmed (payment) | Group Representative only | All participant confirmation codes + E-Pass links |
| Invoice | Group Representative (registration creator) | Invoice PDF/details |
| Session ended | Session creator (admin) | Attendance list of all attendees |
| Admin notification (new registration) | Staff with event.manage permission | Summary of new registration |

> **Note**: E-Pass and confirmation codes are sent to the **Group Representative's email only**. Individual participants access their E-Pass via the Profile Dashboard if they have their own account, or via the public E-Pass link shared by the representative.

---

## 16. Database Triggers

```sql
-- Auto-update updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON eckcm_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_people_updated_at
  BEFORE UPDATE ON eckcm_people
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_registrations_updated_at
  BEFORE UPDATE ON eckcm_registrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON eckcm_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON eckcm_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_app_config_updated_at
  BEFORE UPDATE ON eckcm_app_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## 17. Key Deposit & Fee Pricing Source of Truth

> **Single Source of Truth**: All fee amounts are stored in `eckcm_fee_categories` per event.
> `eckcm_app_config` fields (`key_deposit_cents`, `vbs_fee_cents`, `additional_lodging_fee_cents`) serve as **default values** when creating a new event's fee categories. They are NOT used at runtime for pricing calculations.
>
> **Runtime pricing flow**:
> 1. Admin creates event -> system copies default values from `app_config` to `fee_categories`
> 2. Admin can customize per-event prices in `fee_categories`
> 3. `PricingService` reads only from `fee_categories` for calculations

---

## 18. Legal & Compliance

### 18.1 Public Legal Pages
- `/terms` - Terms of service (public, no auth required)
- `/privacy` - Privacy policy (public, no auth required)
- Content served from `eckcm_legal_content` table via CMS

### 18.2 Legal Content Management
- Admin page: `admin/settings/legal/page.tsx`
- Supports bilingual content (EN/KO)
- Versioned with `published_at` timestamp
- Content types: `'terms'` | `'privacy'`

### 18.3 Registration Agreement
- Users must agree to terms before completing Zelle payment submission
- Agreement checkbox enforced client-side and server-side

---

---

## 19. Implementation-Only Items (v4 - Officially Recognized)

These items exist in the implementation but were not in the original design specification. They are recognized as valid implementation decisions and documented here to keep design and implementation in sync.

### 19.1 Additional Database Tables

| Table | Purpose | Used In |
|-------|---------|---------|
| `eckcm_fee_category_inventory` | Inventory tracking per fee category | `src/app/(admin)/admin/inventory/inventory-manager.tsx` |
| `eckcm_email_logs` | Email delivery logging and audit trail | `src/lib/email/email-log.service.ts`, `src/app/api/admin/email/logs/route.ts` |

### 19.2 Additional Services

| Service | Purpose | File |
|---------|---------|------|
| `refund.service.ts` | Stripe refund processing logic | `src/lib/services/refund.service.ts` |
| `email-log.service.ts` | Email delivery logging to `eckcm_email_logs` | `src/lib/email/email-log.service.ts` |

### 19.3 Additional Components

| Component | Purpose | File |
|-----------|---------|------|
| `force-light-mode.tsx` | Forces light mode during registration wizard | `src/components/registration/force-light-mode.tsx` |
| `payment-icons.tsx` | Brand icons for payment method display | `src/components/payment/payment-icons.tsx` |
| `sanitized-html.tsx` | Safe HTML rendering (DOMPurify-based) | `src/components/shared/sanitized-html.tsx` |

### 19.4 Additional Library Files

| File | Purpose |
|------|---------|
| `src/lib/app-config.ts` | App configuration helper (reads `eckcm_app_config`) |
| `src/lib/color-theme.ts` | Color theme constants and helpers |
| `src/lib/checkin/offline-store.ts` | IndexedDB store for offline check-in data |
| `src/lib/context/registration-context.tsx` | Registration wizard context (implements `use-registration.ts`) |
| `src/lib/email/email-config.ts` | Email configuration reader |
| `src/lib/logger.ts` | Structured application logger |
| `src/lib/rate-limit.ts` | Request rate limiting middleware helper |
| `src/lib/auth/admin.ts` | Admin auth verification helper |

### 19.5 Additional Pages (Error/Loading Boundaries)

| Page | Purpose |
|------|---------|
| `src/app/(public)/error.tsx` | Error boundary for public routes |
| `src/app/(protected)/error.tsx` | Error boundary for protected routes |
| `src/app/(protected)/loading.tsx` | Loading state for protected routes |

### 19.6 Intentionally Deferred Items

The following designed items are deferred to a future iteration:

| Item | Reason |
|------|--------|
| `POST /api/payment/donate` | Donation flow not yet required |
| `public/donate/page.tsx` | Donation page not yet required |
| `public/pay/[code]/page.tsx` | Public payment link not yet required |
| `POST /api/admin/lodging/magic-generator` | Complex bulk generation logic, deferred |
| `POST /api/admin/invoices/custom` | Custom invoice UI not yet required |
| `POST /api/sheets/sync` | Google Sheets integration deferred |
| `sheets.service.ts` | Google Sheets integration deferred |
| `public/sw.js` + PWA config | PWA service worker deferred |
| `eckcm_meal_rules` table wiring | Meals admin uses `eckcm_registration_selections` |
| `eckcm_meal_selections` table wiring | Meals admin uses `eckcm_registration_selections` |
| `eckcm_sheets_cache_participants` | Google Sheets deferred |

---

*Generated by bkit PDCA v1.5.2 (v4 - Synced with implementation, Act-5)*
*Plan Reference: docs/01-plan/features/online-registration.plan.md*
*Last updated: 2026-03-01 (Iteration 5 - pdca-iterator)*
