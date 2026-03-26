# ECKCM Project Changelog

All notable changes to the ECKCM Online Registration & Management System will be documented in this file.

## Unreleased (Development)

### Deferred to Phase 15
- Service worker implementation for full PWA offline support
- Google Sheets integration for inventory management
- Additional E2E tests for user workflows
- Performance optimization and bundle size reduction
- Analytics integration for donation tracking
- Recurring donation support (monthly giving)

---

## [1.0.0] - 2026-03-26

### PDCA Completion Report
- **Feature**: online-registration (Online Registration & Management System)
- **Status**: ✅ COMPLETED
- **Match Rate**: 95.6% (237/248 designed items)
- **Duration**: 43 days (2026-02-12 → 2026-03-26)
- **PDCA Cycles**: 5 Act iterations

### Completion Metrics
- Auth Routes: 7/7 (100%)
- Admin Routes: 44/44 (100%)
- API Routes: 42/42 (100%)
- Services: 10/10 (100%)
- Components: 26/26 (100%)
- Hooks: 5/5 (100%)
- Lib Infrastructure: 27/27 (100%)
- Database Tables: 39/39 (100%)
- Public Routes: 5/7 (71%, deferred)
- PWA: 1/4 (25%, deferred)

### Key Features (Ready for Production)
- Multi-step registration wizard with autofill
- Stripe + Zelle payment processing with webhook
- Admin dashboard with 44 pages
- Real-time smart polling + admin presence
- QR-based check-in (online/offline)
- Email communications with PDF invoicing
- Role-based access control (10 role types)
- Room assignment & lodging management
- Audit logging for all admin changes
- Meal selection with pricing rules

### Deferred Items (11 total, intentional)
- PWA service worker (Phase 15)
- Google Sheets sync (Phase 15)
- Manual payment page (Phase 15)
- Donation page routes (NOTE: API implemented in v8.0)
- Admin API wrappers (Magic room generator, custom invoice)
- Meal rules DB wiring (functional via alternative query)
- Full i18n (Korean labels partial)

### Undocumented Additions (42 items)
- 7 new database tables (donations, locks, presence, funding, adjustments, links, profiles)
- 17 new API routes (payment checks, donation endpoints, checkins)
- 18 implementation-only components and utilities

### v8.0 Final Changes (2026-03-26)
- Stripe webhook fully restored (was temporarily removed in v6.0)
- Donation page + donation API routes implemented
- Funding tracker for donation allocations
- Registration adjustments ledger
- Refund emails for payment refunds
- `allow_add_members` toggle for registration groups
- Cron cleanup for abandoned DRAFT registrations
- All 248 designed items verified (237 implemented, 11 deferred)

### Documentation
- Completion Report: [online-registration.report.md](features/online-registration.report.md)
- Full Gap Analysis: [online-registration.analysis.md](../03-analysis/features/online-registration.analysis.md)

---

## [1.1.0] - 2026-03-24

### Added

#### Donation Features
- Public donation page at `/donation` with no authentication required
- Preset donation amounts ($25, $50, $100, $250)
- Custom donation amount input ($1–$10,000 range)
- Optional donor name and email capture for receipts
- "Cover processing fees" option (~2.9% + $0.30)
- Stripe Elements card payment integration
- Success confirmation screen with "Make Another Donation" CTA
- Stripe Customer creation for email receipt handling

#### Donation API
- `POST /api/donation/create-intent` - Creates Stripe PaymentIntent and PENDING donation record
- `POST /api/donation/confirm` - Confirms donation after payment success
- Rate limiting by IP address (5 req/min create, 10 req/min confirm)

#### Database
- New `eckcm_donations` table for storing donation records
- Stripe PaymentIntent ID tracking with indexes
- Donation status tracking (PENDING, SUCCEEDED, FAILED)
- Metadata fields for confirmation source tracking

#### Webhook Enhancement
- Extended existing Stripe webhook to handle donation payment intents
- Support for `payment_intent.succeeded` and `payment_intent.payment_failed` events
- Automatic status updates for donation records

### Fixed
- Added missing rate limit validation on donation confirm endpoint

### Documentation
- PDCA Completion Report for donation-page feature
- Gap analysis with 95% design match rate
- All 8 functional requirements verified

### Known Improvements for Future Versions
- Add unit and E2E tests for donation flow
- Implement custom confirmation email via Resend
- Add event tracking for donation funnel analytics
- Support recurring donations (monthly giving)
- Create donor profiles with donation history

---

## [1.0.0] - 2026-02-26

### Added

#### Authentication & Authorization
- Google OAuth integration
- Apple OAuth integration
- Email/password authentication with verification
- Password reset flow
- Role-based access control (RBAC) with 6 role types
- Granular permission system
- Staff event-scope assignments

#### User Features
- Multi-step registration wizard (5 complete steps)
- Real-time price estimation
- E-Pass generation with QR codes
- Profile dashboard with registration history
- Receipt management and PDF export
- Registration modification and cancellation requests
- Mobile-responsive design
- Dark mode support
- Bilingual interface (English/Korean)

#### Payment Processing
- Stripe Elements integration
- Apple Pay support
- Google Pay support
- ACH/Bank transfer
- Check payment option (with visual component)
- Zelle support
- Automated invoice generation
- Full and partial refund management
- Cover fees option for users
- Webhook integration for payment confirmation

#### Check-in System
- Self check-in (device camera QR scanning)
- Kiosk check-in interface
- Session-based check-in
- Real-time check-in statistics
- Offline-first check-in with IndexedDB caching
- Delta sync for efficient offline→online transition
- Attendance email notifications
- Realtime dashboard updates

#### Admin Dashboard
- 44 dedicated admin pages covering all operations
- Settings (11 pages): registration, fees, groups, departments, churches, form fields, Stripe, Google Sheets, email, roles, legal, configuration, airport rides, sessions, lodging
- Events management with CRUD and activation control
- Participant data management with Excel-like tables
- Search, filter, sort, and export capabilities
- Lodging management (4 pages): buildings, floor, rooms, assignments
- Meals management with selection tracking
- User and permission management
- Check-in management (6 pages): self, kiosk, session list/detail/creation
- Invoice management with custom creation and resend
- Print capabilities (lanyards, QR cards, PNG/PDF export)
- Room group assignment workflow
- Airport transportation management
- Fee category inventory tracking
- Comprehensive audit logging

#### Data Management
- CSV export for registrations and participants
- PDF export for receipts and reports
- Bulk operations support
- Real-time data synchronization
- Change audit trail for compliance

#### Email Notifications
- Registration confirmation emails
- E-Pass delivery
- Invoice emails
- Session attendance notifications
- Transactional email via Resend

#### Database
- 34+ PostgreSQL tables with comprehensive schema
- Row-Level Security (RLS) for access control
- Full-text search capabilities
- Realtime change notifications
- Audit logging tables

#### Infrastructure
- Next.js 16 with App Router
- shadcn/ui v4 components
- Tailwind CSS v4 styling
- Supabase backend (Auth, DB, Realtime, Storage)
- Vercel deployment ready
- PWA manifest configuration
- TypeScript strict mode
- Zod validation schemas
- Error handling and logging

### Fixed

#### Critical Bugs
- Removed references to nonexistent `eckcm_system_settings` table (replaced with `eckcm_app_config`)
- Fixed Tailwind CSS v4 variable syntax (changed from `[--var]` to `(--var)`)
- Fixed shadcn/ui Calendar component broken CSS variables
- Fixed Stripe lazy initialization pattern
- Fixed Supabase PostgREST table name case sensitivity
- Fixed Radix UI dropdown hydration mismatch

#### Known Issues Resolved
- Database table naming convention standardized to lowercase
- Supabase client configuration for server-side use
- Next.js middleware renamed from `middleware.ts` to proper location in App Router

### Security

- Row-Level Security (RLS) policies at database layer
- HTTPS enforcement for all routes
- CSRF protection via Next.js
- Input validation with Zod schemas
- Secure Stripe key handling (server-side only)
- Email verification for account security
- Session timeout management
- Audit logging for compliance

### Performance

- Server-side rendering for fast initial load
- Realtime subscriptions instead of polling
- Optimized database queries with indexing
- Offline-first check-in reducing server load
- Efficient data caching strategies
- Component-level code splitting

### Documentation

- Plan document: Detailed feature planning (14 development phases)
- Design document: Technical architecture and specifications
- Analysis report: Gap analysis with 93% match rate
- Completion report: Comprehensive project documentation
- Inline code documentation with TypeScript types

### Known Limitations

- PWA service worker not implemented (offline mode partial)
- Google Sheets integration not completed
- Public donation page not implemented
- Magic room generator API not wired to UI
- Limited test coverage (tests to be added in next cycle)

---

## Roadmap

### Immediate (Next Sprint)
- [ ] Service worker implementation
- [ ] Unit test coverage (70%+)
- [ ] E2E tests for critical flows
- [ ] API documentation (OpenAPI spec)
- [ ] Performance optimization

### Near-term (Next Quarter)
- [ ] Google Sheets sync integration
- [ ] SMS notifications
- [ ] Advanced reporting and analytics
- [ ] Payment reconciliation tools
- [ ] Mobile app (React Native)

### Future
- [ ] AI-powered meal recommendations
- [ ] Real-time currency conversion
- [ ] Multi-event management
- [ ] Streaming exports for large datasets
- [ ] Custom theme builder

---

## Statistics

| Metric | Value |
|--------|-------|
| Total Routes | 67 |
| API Endpoints | 29/33 (88%) |
| Admin Pages | 44/44 (100%) |
| Components | 26/26 (100%) |
| Services | 9/10 (90%) |
| Database Tables | 34/39 (87%) |
| Design Match Rate | 93% (206/222 items) |
| Lines of Code | ~50K+ |
| Languages Supported | 2 (English, Korean) |

---

## Contributors

- **Product**: ECKCM Board
- **Architecture**: Technical Team
- **Development**: Full-stack Team
- **Analysis**: gap-detector Agent (Opus 4.6)
- **Documentation**: report-generator Agent

---

## Support

For issues, questions, or feature requests, please contact the development team or create an issue in the project repository.

---

**Last Updated**: 2026-02-26
**Version**: 1.0.0 (PDCA Iteration 4 Complete)
