# ECKCM Project Changelog

All notable changes to the ECKCM Online Registration & Management System will be documented in this file.

## Unreleased (Development)

### In Progress
- Service worker implementation for full PWA offline support
- Google Sheets integration for inventory management
- Additional E2E tests for user workflows
- Performance optimization and bundle size reduction

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
