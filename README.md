# ECKCM - East Coast Korean Camp Meeting

Online registration and event management system for the Eastern Korean Churches Camp Meeting, a multi-day church conference with 500+ participants.

Built with **Next.js 16**, **Supabase**, **Stripe**, and **shadcn/ui**.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Authentication & Authorization](#authentication--authorization)
- [Payment System](#payment-system)
- [Check-in System](#check-in-system)
- [Admin Dashboard](#admin-dashboard)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

ECKCM is a full-stack web application that handles the complete lifecycle of a multi-day church conference:

1. **Registration** — Multi-step wizard for participants to register, select lodging, meals, and airport pickup
2. **Payment** — Stripe-powered payment processing with multiple methods (card, Apple Pay, Google Pay, Zelle, check)
3. **E-Pass** — QR-code-based digital pass for check-in and identification
4. **Check-in** — Real-time attendance tracking with offline-capable QR scanning
5. **Admin** — Comprehensive dashboard for event management, lodging assignments, invoicing, and audit logging

The system supports bilingual content (English/Korean) and is designed for annual recurring events.

---

## Features

### For Participants
- Multi-step registration wizard with real-time price estimation
- Multiple payment methods (Stripe card, Apple Pay, Google Pay, Zelle, check)
- Digital E-Pass with QR code for check-in
- Dashboard to view registrations, receipts, and manage profile
- Registration modification and cancellation requests
- PDF receipt downloads

### For Administrators
- Event creation and configuration
- 44-page admin dashboard covering all operations
- Participant management with Excel-like data tables (search, filter, sort, export)
- Lodging management (buildings, floors, rooms, group assignments)
- Check-in session management (self, kiosk, session-based)
- Invoice management with custom creation
- Manual registration and payment processing
- Refund management (full and partial)
- Bulk email announcements via Resend
- Print capabilities (lanyards, QR cards, PDF/PNG export)
- Fee category and inventory tracking
- Airport transportation management
- Meal selection and tracking
- Comprehensive audit logs
- Role-based staff access control

### Technical Highlights
- Offline-capable check-in with IndexedDB caching and batch sync
- Real-time updates via Supabase Realtime
- Stripe webhook integration for payment status tracking
- Cloudflare Turnstile CAPTCHA for bot protection
- Row-Level Security (RLS) at the database layer
- Bilingual support (English/Korean)
- Dark/light theme support

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Turbopack) |
| **Language** | TypeScript (strict mode) |
| **UI** | [shadcn/ui v4](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) |
| **Database** | [Supabase](https://supabase.com/) (PostgreSQL) |
| **Auth** | Supabase Auth (email, Google OAuth, Apple OAuth) |
| **Payments** | [Stripe](https://stripe.com/) (Payment Intents API) |
| **Email** | [Resend](https://resend.com/) |
| **Forms** | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) |
| **QR Codes** | qrcode.react + @yudiel/react-qr-scanner |
| **PDF** | pdf-lib |
| **CAPTCHA** | Cloudflare Turnstile |
| **Offline Storage** | IndexedDB (idb) |
| **Deployment** | [Vercel](https://vercel.com/) |

---

## Project Structure

```
eckcm/
├── src/
│   ├── app/
│   │   ├── (admin)/admin/        # Admin dashboard (44 pages)
│   │   │   ├── checkin/          # Check-in management (self, kiosk, session)
│   │   │   ├── events/           # Event CRUD
│   │   │   ├── invoices/         # Invoice search and creation
│   │   │   ├── lodging/          # Buildings, rooms, assignments
│   │   │   ├── meals/            # Meal management
│   │   │   ├── participants/     # Participant data table
│   │   │   ├── print/            # Lanyard and QR card printing
│   │   │   ├── registrations/    # Registration management
│   │   │   ├── settings/         # 15 settings pages
│   │   │   └── ...
│   │   ├── (auth)/               # Auth pages (login, signup, reset)
│   │   ├── (protected)/          # User pages (dashboard, register)
│   │   │   ├── dashboard/        # User profile, e-pass, receipts
│   │   │   └── register/[eventId]/ # Multi-step registration wizard
│   │   ├── (public)/             # Landing page, terms, privacy
│   │   ├── api/                  # API routes (40 endpoints)
│   │   │   ├── admin/            # Admin-only APIs
│   │   │   ├── checkin/          # Check-in APIs
│   │   │   ├── email/            # Email APIs
│   │   │   ├── export/           # CSV/PDF export
│   │   │   ├── payment/          # Payment processing
│   │   │   └── registration/     # Registration APIs
│   │   └── epass/[token]/        # Public E-Pass viewer
│   ├── components/               # Reusable React components
│   │   └── ui/                   # shadcn/ui base components
│   ├── contexts/                 # React context providers
│   └── lib/
│       ├── services/             # Business logic services
│       ├── supabase/             # Supabase client configuration
│       └── utils/                # Utility functions
├── public/                       # Static assets
└── docs/                         # PDCA documentation
    ├── 01-plan/                  # Feature planning
    ├── 02-design/                # Technical architecture
    ├── 03-analysis/              # Gap analysis reports
    └── 04-report/                # Completion reports
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [npm](https://www.npmjs.com/) 10 or later
- A [Supabase](https://supabase.com/) project
- A [Stripe](https://stripe.com/) account
- A [Resend](https://resend.com/) account
- A [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) site key

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/eckcm.git
cd eckcm

# Install dependencies
npm install

# Set up environment variables (see next section)
cp .env.example .env.local

# Start the development server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with Turbopack |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

---

## Environment Variables

Create a `.env.local` file in the project root with the following variables:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Resend (Email)
RESEND_API_KEY=re_...

# Cloudflare Turnstile (CAPTCHA)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-site-key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_URL=https://your-domain.com
```

---

## Database Schema

The database uses **34 PostgreSQL tables** in Supabase, all prefixed with `eckcm_`. Key tables:

### Core

| Table | Purpose |
|-------|---------|
| `eckcm_users` | User accounts linked to Supabase Auth |
| `eckcm_people` | Person records (separated from users for family registrations) |
| `eckcm_events` | Event configuration (name, dates, location, fees) |
| `eckcm_registrations` | Registration records with status and payment tracking |
| `eckcm_participants` | Individual event participants |
| `eckcm_epass` | E-Pass records with QR tokens |

### Financial

| Table | Purpose |
|-------|---------|
| `eckcm_invoices` | Invoice records |
| `eckcm_invoice_line_items` | Invoice line item details |
| `eckcm_payments` | Payment transactions |
| `eckcm_fee_categories` | Fee category definitions |
| `eckcm_refund_requests` | Refund request tracking |

### Lodging

| Table | Purpose |
|-------|---------|
| `eckcm_buildings` | Lodging buildings |
| `eckcm_floors` | Building floors |
| `eckcm_rooms` | Individual rooms with capacity |
| `eckcm_room_assignments` | Group-to-room assignments |
| `eckcm_room_groups` | Room grouping definitions |

### Configuration

| Table | Purpose |
|-------|---------|
| `eckcm_app_config` | Application settings |
| `eckcm_churches` | Church directory |
| `eckcm_departments` | Department definitions |
| `eckcm_registration_groups` | Registration group types |
| `eckcm_sessions` | Check-in session definitions |
| `eckcm_staff_roles` | Staff role definitions |
| `eckcm_staff_assignments` | Staff role assignments |
| `eckcm_form_field_config` | Dynamic form field configuration |
| `eckcm_audit_logs` | Comprehensive audit trail |

> **Note**: All table names are lowercase. PostgREST is case-sensitive, so table names must match exactly.

---

## API Endpoints

### Registration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/registration/estimate` | Calculate price estimate |
| `POST` | `/api/registration/submit` | Submit new registration |
| `POST` | `/api/registration/[id]/cancel` | Cancel a registration |
| `GET` | `/api/registration/[id]/event-id` | Get event ID for registration |

### Payment

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/payment/create-intent` | Create Stripe PaymentIntent |
| `POST` | `/api/payment/confirm` | Confirm payment |
| `GET` | `/api/payment/retrieve-intent` | Retrieve PaymentIntent status |
| `POST` | `/api/payment/zelle-submit` | Submit Zelle payment details |
| `GET` | `/api/payment/methods` | Get available payment methods |
| `POST` | `/api/payment/update-cover-fees` | Update cover-fees preference |

### Check-in

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/checkin/verify` | Verify QR code scan |
| `POST` | `/api/checkin/batch-sync` | Sync offline check-ins |
| `GET` | `/api/checkin/epass-cache` | Download participant allowlist |
| `GET` | `/api/checkin/delta` | Get changes since timestamp |
| `GET` | `/api/checkin/stats` | Get check-in statistics |

### Email

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/email/confirmation` | Send registration confirmation |
| `POST` | `/api/email/invoice` | Send invoice email |
| `POST` | `/api/email/test` | Send test email |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/admin/registration` | Create manual registration |
| `POST` | `/api/admin/refund` | Process refund |
| `GET` | `/api/admin/refund/info` | Get refund details |
| `POST` | `/api/admin/payment/manual` | Record manual payment |
| `POST` | `/api/admin/stripe-sync` | Sync Stripe data |
| `POST` | `/api/admin/hard-reset-event` | Force reset event data |
| `GET` | `/api/admin/app-config` | Get app configuration |

### Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/export/csv` | Export data as CSV |
| `POST` | `/api/export/pdf` | Export data as PDF |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/stripe/publishable-key` | Get Stripe publishable key |

---

## Authentication & Authorization

### Auth Providers

- **Email/password** with email verification
- **Google OAuth**
- **Apple OAuth**
- Password reset flow with secure tokens

### Role-Based Access Control (RBAC)

Staff roles are managed through `eckcm_staff_roles` and `eckcm_staff_assignments`:

| Role | Access Level |
|------|-------------|
| `SUPER_ADMIN` | Full system access |
| `EVENT_ADMIN` | Event-level administration |
| `ROOM_COORDINATOR` | Lodging management |
| `CHECKIN_STAFF` | General check-in operations |
| `SESSION_CHECKIN_STAFF` | Session-based check-in |
| `DINING_CHECKIN_STAFF` | Meal check-in |
| `KEY_DEPOSIT_STAFF` | Key deposit management |
| `CUSTOM` | Custom role with specific permissions |

### Security

- Row-Level Security (RLS) policies on all database tables
- HTTPS enforcement
- Cloudflare Turnstile CAPTCHA on auth forms
- HTML sanitization with DOMPurify
- Supabase service role key restricted to server-side only

---

## Payment System

### Stripe Integration

The payment system uses Stripe Payment Intents for secure, PCI-compliant processing:

- **Card payments** via Stripe Elements
- **Apple Pay** and **Google Pay** via Payment Request Button
- **Zelle** transfer (manual verification)
- **Check** payment (manual verification)
- **Cover fees** option (participant covers processing fees)

### Payment Flow

```
Registration → Price Estimate → Create PaymentIntent → Collect Payment
    → Stripe Webhook → Update Status → Generate Invoice → Send Confirmation
```

### Refunds

Admins can process full or partial refunds through the dashboard. Refund requests are tracked in `eckcm_refund_requests` with a complete audit trail.

---

## Check-in System

Three check-in modes are supported:

### Self Check-in
Participants scan their own E-Pass QR code using their device camera.

### Kiosk Check-in
Staff use a dedicated kiosk interface with a QR scanner for high-throughput check-in.

### Session Check-in
Session-specific attendance tracking for workshops, meals, or other scheduled activities.

### Offline Capabilities

The check-in system works offline using IndexedDB:

1. **Pre-cache** — Downloads participant allowlist for local verification
2. **Offline scan** — Verifies QR codes against local cache
3. **Batch sync** — Uploads queued check-ins when connectivity returns
4. **Delta sync** — Efficiently fetches only changes since last sync

---

## Admin Dashboard

The admin dashboard provides 44 pages across these sections:

| Section | Pages | Key Features |
|---------|-------|-------------|
| **Dashboard** | 1 | Event overview, statistics |
| **Events** | 2 | Create/edit events |
| **Registrations** | 2 | View all, create manual |
| **Participants** | 1 | Data table with search/filter/export |
| **Lodging** | 4 | Buildings, rooms, pending/assigned groups |
| **Room Groups** | 1 | Room group management |
| **Check-in** | 6 | Self, kiosk, session list/detail/new |
| **Invoices** | 1 | Search and custom creation |
| **Meals** | 1 | Meal management |
| **Airport** | 1 | Transportation management |
| **Print** | 2 | Lanyards, QR cards |
| **Users** | 2 | User management, detail view |
| **Inventory** | 1 | Fee category inventory |
| **Audit** | 1 | Comprehensive audit logs |
| **Settings** | 15 | Registration, fees, groups, departments, churches, form fields, Stripe, Google Sheets, email, roles, legal, configuration, airport rides, sessions, lodging |
| **Other** | 1 | Unauthorized page |

---

## Deployment

### Vercel (Recommended)

The app is configured for deployment on Vercel:

1. Connect your GitHub repository to Vercel
2. Set all environment variables in the Vercel dashboard
3. Deploy

Security headers (HSTS, X-Frame-Options, etc.) are configured in `next.config.ts`.

### Stripe Webhook

For production, configure a Stripe webhook endpoint pointing to:

```
https://your-domain.com/api/stripe/webhook
```

Subscribe to the following events:
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

### Development Notes

- **Tailwind CSS v4**: Use `w-(--var)` syntax for CSS variables (not `w-[--var]`)
- **Next.js 16**: Middleware is `proxy.ts` (not `middleware.ts`)
- **Supabase**: Server client is imported as `createClient` from `@/lib/supabase/server`
- **Stripe**: Use lazy `getStripeServer()` function for server-side Stripe instances

---

## License

This project is proprietary software. All rights reserved.
